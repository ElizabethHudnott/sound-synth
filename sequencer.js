(function(global) {
'use strict';

const DEFAULT_CHANGES = new Map();

const noteParameters = new Set();
noteParameters.add(Synth.Param.NOTES);
noteParameters.add(Synth.Param.GATE);
noteParameters.add(Synth.Param.INSTRUMENT);
noteParameters.add(Synth.Param.PHRASE);

function cloneChange(change) {
	if (Array.isArray(change)) {
		return change.map(x => x.clone());
	} else {
		return change.clone();
	}
}

function cloneChanges(parameterMap) {
	if (parameterMap === undefined) {
		return undefined;
	}

	const newMap = new Map();
	for (let [key, change] of parameterMap) {
		newMap.set(key, cloneChange(change));
	}
	return newMap;
}

class Song {

	constructor() {
		// Map names to note data for shorter phrases
		this.phrases = new Map();
		// Map song position slots to Pattern objects
		this.patterns = [];
		// Begin the song with the channels configured in some particular way.
		this.initialParameters = [];
		// Loop a section of the song forever if not undefined.
		this.loopFrom = undefined;
		// Text based metadata. Use Dublin Core.
		this.metadata = new Map();
	}

	play(system, step) {
		for (let pattern of this.patterns) {
			if (pattern !== undefined) {
				step = pattern.play(system, this, step);
			}
		}
	}

	getPhrase(phraseName) {
		return this.phrases.get(phraseName);
	}

	getPhrases() {
		return this.phrases.keys();
	}

	addOrReplacePhrase(phrase) {
		this.phrases.set(phrase.name, phrase);
	}

	removePhrase(phraseName) {
		this.phrases.delete(phraseName);
	}

	copyPhrase(oldName, newName) {
		const clone = this.phrases.get(oldName).clone();
		clone.name = newName;
		this.phrases.set(newName, clone);
	}

}

class PatternEditError extends Error {
	constructor(message, column, row) {
		super(message + ' at row ' + row + (column !== undefined ? ', column ' + column : '') + '.');
		this.column = column;
		this.row = row;
	}
}

class Pattern {

	constructor(numTracks, length) {
		if (length === undefined) {
			length = 64;
		}
		// Column 0 is the master column
		const numColumns = numTracks + 1;
		this.columns = new Array(numColumns);
		this.offsets = new Array(numColumns);
		this.offsets.fill(0);
		this.length = length;
	}

	clone() {
		const newPattern = new Pattern(0, this.length);
		const numColumns = this.columns.length;
		for (let i = 0; i < numColumns; i++) {
			newPattern.columns[i] = this.columns[i].clone();
		}
		newPattern.offsets = this.offsets.slice();
	}

	addColumn() {
		const columnNumber = this.columns.length;
		this.offsets[columnNumber] = 0;
	}

	removeColumn(columnNumber) {
		this.columns.splice(columnNumber, 1);
		this.offsets.splice(columnNumber, 1);
	}

	clear(fromColumn, toColumn, fromLine, toLine) {
		for (let i = fromColumn; i <= toColumn; i++) {
			const column = this.columns[i];
			if (column !== undefined) {
				const offset = this.offsets[i];
				column.clear(fromLine + offset, toLine + offset);
			}
		}
	}

	copy(fromColumn, toColumn, fromLine, toLine) {
		const copyMaster = fromColumn === 0 ? 1 : 0;
		const newPattern = new Pattern(toColumn - fromColumn + 1 - copyMaster, toLine - fromLine + 1);
		for (let columnNumber = fromColumn; columnNumber <= toColumn; columnNumber++) {
			let offset = this.offsets[columnNumber];
			let phraseTo = toLine + offset;
			if (phraseTo >= 0) {
				let phraseFrom = fromLine + offset;
				if (phraseFrom < 0) {
					newPattern.offsets[columnNumber] = phraseFrom;
					phraseFrom = 0;
				}
				newPattern.columns[columnNumber] = this.columns[columnNumber].copy(phraseFrom, phraseTo);
			}
		}
		return newPattern;
	}

	play(system, song, step) {
		if (step === undefined) {
			step = system.nextStep();
		}

		const phrases = song.phrases;
		const numColumns = this.columns.length;
		const length = this.length;
		const masterColumn = this.columns[0];
		const masterRows = masterColumn === undefined ? [] : masterColumn.rows;
		const masterOffset = this.offsets[0];
		const highChannelParams = system.channels[numColumns - 2].parameters;

		let lineTime, numTicks;
		let loopStart = 0, loopIndex = 1;
		const activePhrases = [];
		const phraseOffsets = [];
		const transpositions = [];

		let rowNum = 0;
		while (rowNum < length) {
			const masterChanges = masterRows[rowNum + masterOffset];
			let nextRowNum = rowNum + 1;
			let patternDelay = 0;

			if (masterChanges !== undefined) {
				const patternDelayChange = masterChanges.get(Synth.Param.PATTERN_DELAY);
				if (patternDelayChange !== undefined) {
					patternDelay = patternDelayChange.value;
				}
				if (masterChanges.has(Synth.Param.LOOP_START)) {
					loopStart = rowNum;
				}
				const numLoopsChange = masterChanges.get(Synth.Param.LOOPS);
				if (numLoopsChange !== undefined) {
					if (loopIndex < numLoopsChange.value) {
						rowNum = loopStart;
						loopIndex++;
					} else {
						loopIndex = 1;
					}
				}
			}

			for (let columnNumber = 1; columnNumber < numColumns; columnNumber++) {
				const column = this.columns[columnNumber];
				let changeSources = masterChanges === undefined ? 0 : 1;
				let changes, phraseChanges, columnChanges;

				if (column !== undefined) {
					columnChanges = column.rows[rowNum + this.offsets[columnNumber]];
				}
				if (columnChanges !== undefined) {
					if (columnChanges.has(Synth.Param.PHRASE)) {
						const phraseName = columnChanges.get(Synth.Param.PHRASE).value;
						activePhrases[columnNumber] = phrases.get(phraseName);
						phraseOffsets[columnNumber] = 0;
						transpositions[columnNumber] = 0;
						if (columnChanges.size > 1) {
							changeSources += 4;
						}
					} else {
						changeSources += 4;
					}
				}

				const phrase = activePhrases[columnNumber];
				if (phrase !== undefined) {
					let phraseOffset = phraseOffsets[columnNumber];
					phraseChanges = phrase.rows[phraseOffset];
					phraseOffsets[columnNumber]++;
					if (phraseChanges !== undefined) {
						changeSources += 2;
					}
				}

				if ((changeSources & 6) === 6 &&
					columnChanges.has(Synth.Param.PHRASE_TRANSPOSE) &&
					phraseChanges.has(Synth.Param.NOTES)
				) {
					transpositions[columnNumber] = columnChanges.get(Synth.Param.PHRASE_TRANSPOSE).value - phraseChanges.get(Synth.Param.NOTES).value[0];
				}
				const transpose = transpositions[columnNumber];

				switch (changeSources) {
				case 0:
					changes = DEFAULT_CHANGES;
					break;
				case 1:
					changes = masterChanges;
					break;
				case 2:
					if (!transpose) {
						changes = phraseChanges;
						break;
					}
				default:
					changes = new Map(masterChanges);
					if (phraseChanges !== undefined) {
						for (let [key, change] of phraseChanges) {
							if (change !== Synth.Change.MARK || !changes.has(key)) {
								changes.set(key, change);
							}
						}
						if (transpose) {
							const phraseNoteChange = phraseChanges.get(Synth.Param.NOTES);
							if (phraseNoteChange !== undefined) {
								const transposedNoteChange = phraseNoteChange.clone();
								changes.set(Synth.Param.NOTES, transposedNoteChange);
								const transposedNotes = transposedNoteChange.value;
								for (let i = 0; i < transposedNotes.length; i++) {
									transposedNotes[i] += transpose;
								}
							}
						}
					}
					if (columnChanges !== undefined) {
						for (let [key, change] of columnChanges) {
							if (change === Synth.Change.NONE) {
								if (masterChanges !== undefined && masterChanges.has(key)) {
									changes.set(key, masterChanges.get(key));
								} else {
									changes.delete(key);
								}
							} else if (change !== Synth.Change.MARK || !changes.has(key)) {
								changes.set(key, change);
							}
						}
					}
				}
				lineTime = system.channels[columnNumber - 1].setParameters(changes, step, true);
			}

			numTicks = highChannelParams[Synth.Param.TICKS];
			step += lineTime * (1 + patternDelay / numTicks);
			rowNum = nextRowNum;
		}
		return step;
	}

}

class Phrase {

	constructor(name, length) {
		this.name = name;
		this.rows = [];
		this.length = length;
	}

	clone() {
		const length = this.rows.length;
		const oldRows = this.rows;
		const newRows = new Array(length);
		for (let i = 0; i < length; i++) {
			newRows[i] = cloneChanges(oldRows[i]);
		}
		const newPhrase = new Phrase(this.name, this.length);
		newPhrase.rows = newRows;
		return newPhrase;
	}

	clear(from, to) {
		if (from < 0) {
			from = 0;
		}
		const rows = this.rows;
		if (to >= rows.length) {
			to = rows.length - 1;
		}
		rows.fill(undefined, from, to + 1);
	}

	copy(from, to) {
		let newName;
		if (from === 0 && to === this.length - 1) {
			newName = 'Copy of ' + this.name;
		} else {
			newName = this.name + ' ' + from + '-' + to;
		}
		const newPhrase = new Phrase(newName, to - from + 1);
		newPhrase.rows = this.rows.slice(from, to + 1);
		return newPhrase;
	}

	expand(multiple) {
		const oldLength = this.length;
		const newLength = oldLength * multiple;
		const oldRows = this.rows;
		const newRows = new Array(newLength);
		for (let i = 0; i < oldLength; i++) {
			newRows[i * multiple] = oldRows[i];
		}
		this.rows = newRows;
		this.length = newLength;
	}

	compact(multiple) {
		const oldLength = this.length;
		const newLength = Math.floor(oldLength / multiple);
		const oldRows = this.rows;
		const newRows = new Array(newLength);
		for (let i = 0; i < oldLength; i++) {
			const oldRow = oldRows[i];
			if (i % multiple === 0) {
				newRows[i / multiple] = oldRow;
			} else if (oldRow !== undefined && oldRow.size > 0) {
				throw new PatternEditError('Unable to compact. Data found', undefined, i);
			}
		}
		this.rows = newRows;
		this.length = newLength;
	}

	fill(param, change, from, step, to, copy) {
		if (to === undefined) {
			to = this.length - 1;
		}
		for (let i = from; i <= to; i += step) {
			let changes = this.rows[i];
			if (changes === undefined) {
				changes = new Map();
				this.rows[i] = changes;
			}
			let newChange;
			if (copy === false) {
				newChange = change;
			} else {
				newChange = cloneChange(change);
			}
			changes.set(param, newChange);
		}
	}

	insert(insertPhrase, position) {
		const rows = this.rows;
		const insertRows = insertPhrase.rows;
		const insertLength = insertPhrase.length;
		for (let i = rows.length - 1; i >= position; i--) {
			rows[i + number] = rows[i];
		}
		for (let i = 0; i < insertLength; i++) {
			rows[position + i] = cloneChanges(insertRows[i]);
		}
		this.length += insertLength;
	}

	insertEmptyRows(number, position) {
		const rows = this.rows;
		for (let i = rows.length - 1; i >= position; i--) {
			rows[i + number] = rows[i];
		}
		rows.fill(undefined, position, position + number);
		this.length += number;
	}

	mergeAll(mergePhrase, position) {
		const insertLength = Math.min(mergePhrase.rows.length, this.length - position);
		const rows = this.rows;
		const insertRows = mergePhrase.rows;
		for (let i = 0; i < insertLength; i++) {
			const insertRow = insertRows[i];
			if (insertRow !== undefined) {
				let row = rows[position + i];
				if (row === undefined) {
					row = new Map(insertRow);
					rows[position + i] = row;
				}
				for (let [key, value] of insertRow) {
					row.set(key, cloneChange(value));
				}
			}
		}
	}

	mergeCommands(mergePhrase, position) {
		const insertLength = Math.min(mergePhrase.rows.length, this.length - position);
		const rows = this.rows;
		const insertRows = mergePhrase.rows;
		for (let i = 0; i < insertLength; i++) {
			const insertRow = insertRows[i];
			if (insertRow !== undefined) {
				let row = rows[position + i];
				if (row === undefined) {
					row = new Map(insertRow);
					rows[position + i] = row;
				}
				for (let [key, value] of insertRow) {
					if (!noteParameters.has(key)) {
						row.set(key, cloneChange(value));
					}
				}
			}
		}
	}

	mergeNotes(mergePhrase, position) {
		const insertLength = Math.min(mergePhrase.rows.length, this.length - position);
		const rows = this.rows;
		const insertRows = mergePhrase.rows;
		for (let i = 0; i < insertLength; i++) {
			const insertRow = insertRows[i];
			if (insertRow !== undefined) {
				let row = rows[position + i];
				if (row === undefined) {
					row = new Map(insertRow);
					rows[position + i] = row;
				}
				for (let key of noteParameters) {
					if (insertRow.has(key)) {
						row.set(key, cloneChange(insertRow.get(value)));
					}
				}
			}
		}
	}

	overwriteAll(replacementPhrase, position) {
		const replacementLength = Math.min(replacementPhrase.length, this.length - position);
		const rows = this.rows;
		const replacementRows = replacementPhrase.rows;
		for (let i = 0; i < replacementLength; i++) {
			rows[position + i] = cloneChanges(replacementRows[i]);
		}
	}

	overwriteCommands(replacementPhrase, position) {
		const replacementLength = Math.min(replacementPhrase.length, this.length - position);
		const rows = this.rows;
		const replacementRows = replacementPhrase.rows;
		for (let i = 0; i < replacementLength; i++) {
			let row = rows[position + i];
			if (row === undefined) {
				row = new Map();
				rows[position + i] = row;
			} else {
				for (key of row.keys()) {
					if (!noteParameters.has(key)) {
						row.delete(key);
					}
				}
			}
			const insertRow = insertRows[i];
			if (insertRow !== undefined) {
				for (let [key, value] of insertRow) {
					if (!noteParameters.has(key)) {
						row.set(key, cloneChange(value));
					}
				}
			}
		}
	}

	overwriteNotes(replacementPhrase, position) {
		const replacementLength = Math.min(replacementPhrase.length, this.length - position);
		const rows = this.rows;
		const replacementRows = replacementPhrase.rows;
		for (let i = 0; i < replacementLength; i++) {
			let row = rows[position + i];
			if (row === undefined) {
				row = new Map();
				rows[position + i] = row;
			} else {
				for (key of row.keys()) {
					if (noteParameters.has(key)) {
						row.delete(key);
					}
				}
			}
			const insertRow = insertRows[i];
			if (insertRow !== undefined) {
				for (let [key, value] of insertRow) {
					if (noteParameters.has(key)) {
						row.set(key, cloneChange(value));
					}
				}
			}
		}
	}

	remove(from, to) {
		const removeLength = to - from + 1;
		this.rows.splice(from, removeLength);
		this.length -= removeLength;
	}

	transpose(amount, from, to) {
		if (arguments.length === 1) {
			from = 0;
			to = this.length - 1;
		}
		const modified = new Set();
		for (let i = from; i < to; i++) {
			const changes = this.rows[i];
			if (changes !== undefined) {
				const noteChange = changes.get(Synth.Param.NOTES);
				if (noteChange !== undefined) {
					const changeType = noteChange.type;
					const prefix = changeType[0];
					if (
						changeType !== Synth.ChangeType.NONE &&
						prefix !== Synth.ChangeType.DELTA &&
						prefix !== Synth.ChangeType.MULTIPLY &&
						prefix !== Synth.ChangeType.MARK &&
						!modified.has(changes)
					) {
						const notes = noteChange.value;
						for (let j = 0; j < notes.length; j++) {
							notes[j] += amount;
						}
						modified.add(changes);
					}
				}
				const phraseTransposeChange = changes.get(Synth.Param.PHRASE_TRANSPOSE);
				if (phraseTransposeChange !== undefined) {
					phraseTransposeChange.value += amount;
					modified.add(changes);
				}
			}
		}
	}

	play(system, song, channelNumber, step) {
		if (channelNumber === undefined) {
			channelNumber = 0;
		}
		if (step === undefined) {
			step = system.nextStep();
		}
		const length = this.length;
		const channel = system.channels[channelNumber];
		let transpose = 0;
		let lineTime, subphrase, subphraseOffset;

		for (let rowNum = 0; rowNum < length; rowNum++) {
			let changes, subphraseChanges;
			let changeSources = 0;
			let myChanges = this.rows[rowNum];
			if (myChanges !== undefined) {
				if (myChanges.has(Synth.Param.PHRASE)) {
					const phraseName = myChanges.get(Synth.Param.PHRASE).value;
					subphrase = song.phrases.get(phraseName);
					subphraseOffset = 0;
					transpose = 0;
					if (myChanges.size > 1) {
						changeSources += 4;
					}
				} else {
					changeSources += 4;
				}
			}
			if (subphrase !== undefined) {
				subphraseChanges = subphrase.rows[subphraseOffset];
				subphraseOffset++;
				if (subphraseChanges !== undefined) {
					changeSources += 2;
				}

			}
			if ((changeSources & 6) === 6 && myChanges.has(Synth.Param.PHRASE_TRANSPOSE) &&
				subphraseChanges.has(Synth.Param.NOTES)
			) {
				transpose = myChanges.get(Synth.Param.PHRASE_TRANSPOSE).value - subphraseChanges.get(Synth.Param.NOTES).value[0];
			}

			switch (changeSources) {
			case 0:
				changes = DEFAULT_CHANGES;
				break;
			case 2:
				if (transpose === 0) {
					changes = subphraseChanges;
					break;
				}
			default:
				changes = new Map(subphraseChanges);
				if (transpose !== 0 && subphraseChanges !== undefined) {
					const subphraseNoteChange = subphraseChanges.get(Synth.Param.NOTES);
					if (subphraseNoteChange !== undefined) {
						const transposedNoteChange = subphraseNoteChange.clone();
						changes.set(Synth.Param.NOTES, transposedNoteChange);
						const transposedNotes = transposedNoteChange.value;
						for (let i = 0; i < transposedNotes.length; i++) {
							transposedNotes[i] += transpose;
						}
					}
				}
				if (myChanges !== undefined) {
					for (let [key, change] of myChanges) {
						if (change === Synth.Change.NONE) {
							changes.delete(key);
						} else if (change !== Synth.Change.MARK || !changes.has(key)) {
							changes.set(key, change);
						}
					}
				}
			}
			lineTime = channel.setParameters(changes, step, true);
			step += lineTime;
		}
	}
}

global.Sequencer = {
	Pattern: Pattern,
	Phrase: Phrase,
	Song: Song,
	cloneChanges: cloneChanges,
	noteParameters: noteParameters,
};

})(window);
