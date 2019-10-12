(function(global) {
'use strict';

const DEFAULT_CHANGES = new Map();

const noteParameters = new Set();
noteParameters.add(Synth.Param.DURATION);
noteParameters.add(Synth.Param.FREQUENCY);
noteParameters.add(Synth.Param.GATE);
noteParameters.add(Synth.Param.INSTRUMENT);
noteParameters.add(Synth.Param.NOTES);
noteParameters.add(Synth.Param.VELOCITY);
noteParameters.add(Synth.Param.CHORD_PATTERN);
noteParameters.add(Synth.Param.PHRASE);
noteParameters.add(Synth.Param.PHRASE_OFFSET);
noteParameters.add(Synth.Param.PHRASE_TRANSPOSE);
/*
noteParameters.add(Synth.Param.TICKS);
noteParameters.add(Synth.Param.DELAY_TICKS);
noteParameters.add(Synth.Param.CHORD_SPEED);
noteParameters.add(Synth.Param.RETRIGGER);
noteParameters.add(Synth.Param.LEGATO_RETRIGGER);
noteParameters.add(Synth.Param.RETRIGGER_VOLUME);
noteParameters.add(Synth.Param.GLISSANDO);
noteParameters.add(Synth.Param.GLISSANDO_TICKS);
*/

const DIATONIC_SCALE = [2, 2, 1, 2, 2, 2, 1];
const C_MAJOR = musicalScale(0, 1);

/**
 * @param {number} mode 1 = major, 6 = minor
 */
function musicalScale(baseNote, mode, intervals) {
	if (intervals === undefined) {
		intervals = DIATONIC_SCALE;
	}
	const numIntervals = intervals.length;
	const notes = [];
	let position = baseNote;
	for (let i = 0; i < numIntervals; i++) {
		notes.push(position);
		position = position + intervals[(i + mode - 1) % numIntervals];
	}
	return notes;
}

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

/**
 * Assumes a is not undefined.
 */
function equalChange(a, b) {
	if (b === undefined) {
		return a === undefined;
	}
	if (Array.isArray(a)) {
		if (!Array.isArray(b)) {
			return false;
		}
		const length = a.length;
		if (length !== b.length) {
			return false;
		}
		for (let i = 0; i < length; i++) {
			if (!a[i].equals(b[i])) {
				return false;
			}
		}
		return true;
	} else {
		return a.equals(b);
	}
}

function equalChanges(a, b) {
	if (a === b) {
		return true;
	}
	if (a === undefined || b === undefined) {
		return false;
	}
	for (let [key, aChange] of a) {
		const bChange = b.get(key);
		if (!equalChange(aChange, bChange)) {
			return false;
		}
	}
	for (let key of b.keys()) {
		if (!a.has(key)) {
			return false;
		}
	}
	return true;
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
		this.terminatingColumn = 0;
	}

	clone() {
		const newPattern = new Pattern(0, this.length);
		const numColumns = this.columns.length;
		for (let i = 0; i < numColumns; i++) {
			newPattern.columns[i] = this.columns[i].clone();
		}
		newPattern.offsets = this.offsets.slice();
		newPattern.terminatingColumn = this.terminatingColumn;
	}

	equals(pattern) {
		if (this.terminatingColumn !== pattern.terminatingColumn) {
			return false;
		}
		const length = this.length;
		if (length !== pattern.length) {
			return false;
		}
		const numColumns = this.offsets.length;
		if (numColumns !== pattern.offsets.length) {
			return false;
		}
		const thisColumns = this.columns;
		const patternColumns = pattern.columns;
		for (let i = 0; i < numColumns; i++) {
			const thisColumn = thisColumns[i];
			const patternColumn = patternColumns[i];
			const thisOffset = this.offsets[i];
			const patternOffset = pattern.offsets[i];
			if (thisColumn === patternColumn) {
				// ok
			} else if (thisColumn === undefined || patternColumn === undefined) {
				return false;
			} else {
				for (let j = 0; j < length; j++) {
					const thisChanges = thisColumn[j + thisOffset];
					const patternChanges = patternColumn[j + patternOffset];
					if (!equalChanges(thisChanges, patternChanges)) {
						return false;
					}
				}
			}
		}
		return true;
	}

	addColumn() {
		this.offsets.push(0);
	}

	removeColumn(columnNumber) {
		this.columns.splice(columnNumber, 1);
		this.offsets.splice(columnNumber, 1);
	}

	setColumn(columnNumber, phrase) {
		this.columns[columnNumber] = phrase;
		this.offsets[columnNumber] = 0;
	}

	clearColumn(columnNumber) {
		this.columns[columnNumber] = undefined;
		this.offsets[columnNumber] = 0;
	}

	get numberOfColumns() {
		return this.offsets.length;
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
			const column = this.columns[columnNumber];
			if (column !== undefined) {
				let offset = this.offsets[columnNumber];
				const phraseTo = toLine + offset;
				if (phraseTo >= 0) {
					const newColumnNumber = columnNumber - fromColumn;
					let phraseFrom = fromLine + offset;
					if (phraseFrom < 0) {
						newPattern.offsets[newColumnNumber] = phraseFrom;
						phraseFrom = 0;
					}
					newPattern.columns[newColumnNumber] = column.copy(phraseFrom, phraseTo);
				}
			}
		}
		return newPattern;
	}

	expand(multiple) {
		for (let i = 0; i < this.columns.length; i++) {
			const column = this.columns[i];
			if (column !== undefined) {
				column.expand(multiple);
				this.offsets[i] *= multiple;
			}
		}
		this.length *= multiple;
	}

	static fromArgs(...arr) {
		const columns = [];
		const offsets = [];
		const arrLength = arr.length;
		let i = 0;
		let numColumns = 0;
		let Length = 0;
		while (i < arrLength) {
			const phrase = arr[i];
			if (phrase instanceof Phrase) {
				columns[numColumns] = phrase;
			} else if (phrase !== undefined) {
				throw new Error(String(phrase) + ' is not a phrase.');
			}
			i++;

			let offset = arr[i];
			if (Number.isInteger(offset)) {
				i++
			} else {
				offset = 0;
			}
			offsets[numColumns] = offset;

			if (phrase !== undefined) {
				const columnLength = phrase.length - offset;
				if (columnLength > length) {
					length = columnLength;
				}
			}
			numColumns++;
		}
		if (numColumns === 1) {
			offsets[1] = 0;
		}

		const pattern = new Pattern(Math.max(numColumns - 1, 1), length);
		pattern.columns = columns;
		pattern.offsets = offsets;
		return pattern;
	}

	play(system, song, step) {
		if (step === undefined) {
			step = system.nextStep();
		}

		system.beginPattern(step);
		const numColumns = this.offsets.length;
		const terminatingColumn = this.terminatingColumn;
		const length = this.length;
		const masterColumn = this.columns[0];
		const masterRows = masterColumn === undefined ? [] : masterColumn.rows;

		let maxLineTime;
		const rowNumbers = new Array(numColumns);
		const loopStart = new Array(numColumns);
		for (let i = 0; i < numColumns; i++) {
			rowNumbers[i] = this.offsets[i];
			loopStart[i] = Math.max(rowNumbers[i], 0);
		}
		const loopCounters = new Array(numColumns);
		loopCounters.fill(1);
		const repetitions = new Array(numColumns); // Line repeat function
		repetitions.fill(1);
		let masterRepeatTimes = 1;
		const activePhrases = [];
		const phraseOffsets = [];
		const transpositions = [];
		let masterChanges;

		while (rowNumbers[terminatingColumn] < length) {
			maxLineTime = 0;
			const masterRepeatCount = repetitions[0];
			if (masterRepeatCount === 1) {
				masterChanges = masterRows[rowNumbers[0]];
				if (masterChanges !== undefined) {
					const repeatChange = masterChanges.get(Synth.Param.LINE_REPEAT);
					if (repeatChange !== undefined) {
						masterRepeatTimes = repeatChange.value;
					}
				}
			}
			let nextMasterRow = rowNumbers[0];

			if (masterRepeatCount >= masterRepeatTimes) {
				nextMasterRow++;
				repetitions[0] = 1;
				masterRepeatTimes = 1;
			} else {
				repetitions[0]++;
			}
			if (masterChanges !== undefined && masterRepeatCount === masterRepeatTimes) {
				const loopChange = masterChanges.get(Synth.Param.LOOP);
				if (loopChange !== undefined) {
					const loopValue = loopChange.value;
					if (loopValue === 0) {
						loopStart[0] = rowNumbers[0];
					} else if (loopCounters[0] < loopValue) {
						nextMasterRow = loopStart[0];
						loopCounters[0]++;
					} else {
						loopCounters[0] = 1;
					}
				}
			}
			rowNumbers[0] = nextMasterRow;

			for (let columnNumber = 1; columnNumber < numColumns; columnNumber++) {
				const rowNum = rowNumbers[columnNumber];
				const repetition = repetitions[columnNumber];
				const column = this.columns[columnNumber];
				let changeSources = masterChanges === undefined ? 0 : 1;
				let changes, phraseChanges, columnChanges;

				if (column !== undefined) {
					columnChanges = column.rows[rowNum];
				}
				if (columnChanges !== undefined) {
					const phraseChange = columnChanges.get(Synth.Param.PHRASE);
					if (phraseChange !== undefined) {
						activePhrases[columnNumber] = song.getPhrase(phraseChange.value);
						phraseOffsets[columnNumber] = 0;
						transpositions[columnNumber] = 0;
						if (columnChanges.size > 1) {
							changeSources += 4;
						}
					} else {
						changeSources += 4;
					}
					const phraseOffsetChange = columnChanges.get(Synth.Param.PHRASE_OFFSET);
					if (phraseOffsetChange !== undefined) {
						phraseOffsets[columnNumber] = phraseOffsetChange.value;
					}
				}

				const phrase = activePhrases[columnNumber];
				if (phrase !== undefined) {
					const phraseOffset = phraseOffsets[columnNumber];
					if (phraseOffset >= phrase.rows.length) {
						activePhrases[columnNumber] = undefined;
					} else {
						phraseChanges = phrase.rows[phraseOffset];
						phraseOffsets[columnNumber]++;
						if (phraseChanges !== undefined) {
							changeSources += 2;
						}
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

				let nextRowNum = rowNum + 1;
				const lineTime = system.channels[columnNumber - 1].setParameters(changes, step, true);
				if (lineTime > maxLineTime) {
					maxLineTime = lineTime;
				}

				const loopChange = changes.get(Synth.Param.LOOP);
				if (loopChange !== undefined) {
					const loopValue = loopChange.value;
					if (loopValue === 0) {
						loopStart[columnNumber] = rowNum;
					} else if (loopCounters[columnNumber] < loopValue) {
						nextRowNum = loopStart[columnNumber];
						loopCounters[columnNumber]++;
					} else {
						loopCounters[columnNumber] = 1;
					}
				}
				rowNumbers[columnNumber] = nextRowNum;
			} // end for each column

			step += maxLineTime;

			if (masterRepeatCount === 1 && masterRepeatTimes > 1 && masterChanges !== undefined) {
				masterChanges = new Map(masterChanges);
				masterChanges.delete(Synth.Param.GATE);
			}
		}
		return step;
	}

}

class Phrase {

	constructor(name, length) {
		this.name = name;
		this.rows = [];
		this.length = length;
		// The following properties are just for presentation purposes.
		this.rowsPerBeat = 4;
		this.rowsPerBar = Math.min(16, length);
		this.scale = C_MAJOR;
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
		newPhrase.rowsPerBeat = this.rowsPerBeat;
		newPhrase.rowsPerBar = this.rowsPerBar;
		newPhrase.scale = this.scale;
		return newPhrase;
	}

	setLength(newLength) {
		this.rows.splice(newLength);
		this.length = newLength;
	}

	generateName(from, to) {
		let newName;
		if (from === 0 && to === this.length - 1) {
			newName = 'Copy of ' + this.name;
		} else {
			newName = this.name + ' ' + from + '-' + to;
		}
		return newName;
	}

	clearAll(from, to) {
		const rows = this.rows;
		if (to >= rows.length) {
			to = rows.length - 1;
		}
		rows.fill(undefined, from, to + 1);
	}

	clearCommands(from, to) {
		for (let i = from; i <= to; i++) {
			const oldChanges = this.rows[i];
			if (oldChanges !== undefined) {
				const newChanges = new Map();
				this.rows[i] = newChanges;
				for (let [key, value] of oldChanges) {
					if (noteParameters.has(key)) {
						newChanges.set(key, value);
					}
				}
			}
		}
	}

	clearNotes(from, to) {
		for (let i = from; i <= to; i++) {
			const oldChanges = this.rows[i];
			if (oldChanges !== undefined) {
				const newChanges = new Map();
				this.rows[i] = newChanges;
				for (let [key, value] of oldChanges) {
					if (!noteParameters.has(key)) {
						newChanges.set(key, value);
					}
				}
			}
		}
	}

	copy(from, to) {
		const newName = this.generateName(from, to);
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
		this.rowsPerBeat *= multiple;
		this.rowsPerBar *= multiple;
	}

	compact(multiple) {
		const oldRows = this.rows;
		const oldLength = oldRows.length;
		const newRows = new Array(Math.floor(oldLength / multiple));
		for (let i = 0; i < oldLength; i++) {
			const oldRow = oldRows[i];
			if (i % multiple === 0) {
				newRows[i / multiple] = oldRow;
			} else if (oldRow !== undefined && oldRow.size > 0) {
				throw new PatternEditError('Unable to compact. Data found', undefined, i);
			}
		}
		this.rows = newRows;
		this.length = Math.floor(this.length / multiple);
		const beatsPerBar = this.rowsPerBar / this.rowsPerBeat;
		this.rowsPerBeat = Math.round(this.rowsPerBeat / multiple);
		this.rowsPerBar = this.rowsPerBeat * beatsPerBar;
	}

	copyAndCompact(multiple, from, to) {
		let modulo;
		if (from >= 0) {
			modulo = from % multiple;
		} else {
			from = 0;
			modulo = multiple + from % multiple;
		}
		const oldRows = this.rows;
		const oldLength = oldRows.length;
		to = Math.min(to, oldLength - 1);
		const newRows = [];
		for (let i = from; i <= to; i++) {
			const oldRow = oldRows[i];
			if (i % multiple === modulo) {
				newRows.push(oldRow);
			} else if (oldRow !== undefined && oldRow.size > 0) {
				throw new PatternEditError('Unable to compact. Data found', undefined, i);
			}
		}

		const newName = this.generateName(from, to);
		const newPhrase = newPhrase(newName, newRows.length);
		newPhrase.rows = newRows;
		const beatsPerBar = this.rowsPerBar / this.rowsPerBeat;
		newPhrase.rowsPerBeat = Math.round(this.rowsPerBeat / multiple);
		newPhrase.rowsPerBar = newPhrase.rowsPerBeat * beatsPerBar;
		newPhrase.scale = this.scale;
		return newPhrase;
	}

	detangle() {
		const length = this.rows.length;
		for (let i = 0; i < length; i++ ) {
			this.rows[i] = cloneChanges(this.rows[i]);
		}
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

	static fromObject(obj) {
		const rows = [];
		let length;
		for (let propertyName in obj) {
			if (propertyName === 'length') {
				length = obj[propertyName];
			} else {
				const changes = obj[propertyName];
				const map = new Map();
				const changesLength = changes.length;
				for (let i = 0; i < changesLength; i+= 2) {
					const name = changes[i];
					const value = changes[i + 1];
					map.set(name, new Synth.Change(Synth.ChangeType.SET, value));
				}
				rows[propertyName] = map;
			}
		}
		if (length === undefined) {
			length = rows.length;
		}
		const newPhrase = new Phrase('Untitled', length);
		newPhrase.rows = rows;
		return newPhrase;
	}

	insertAll(insertPhrase, position) {
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

	insertCommands(insertPhrase, position) {
		const rows = this.rows;
		const insertRows = insertPhrase.rows;
		const insertLength = insertPhrase.length;
		for (let i = rows.length - 1; i >= position; i--) {
			rows[i + number] = rows[i];
		}
		for (let i = 0; i < insertLength; i++) {
			const newRow = new Map();
			rows[position + i] = newRow;
			for (let [key, value] of insertRows[i]) {
				if (!noteParameters.has(key)) {
					newRow.set(key, cloneChange(value));
				}
			}
		}
		this.length += insertLength;
	}

	insertNotes(insertPhrase, position) {
		const rows = this.rows;
		const insertRows = insertPhrase.rows;
		const insertLength = insertPhrase.length;
		for (let i = rows.length - 1; i >= position; i--) {
			rows[i + number] = rows[i];
		}
		for (let i = 0; i < insertLength; i++) {
			const newRow = new Map();
			rows[position + i] = newRow;
			for (let [key, value] of insertRows[i]) {
				if (noteParameters.has(key)) {
					newRow.set(key, cloneChange(value));
				}
			}
		}
		this.length += insertLength;
	}

	insertEmpty(number, position) {
		const rows = this.rows;
		for (let i = rows.length - 1; i >= position; i--) {
			rows[i + number] = rows[i];
		}
		rows.fill(undefined, position, position + number);
		this.length += number;
	}

	mergeAll(mergePhrase, position, to) {
		let mergeLength = Math.min(mergePhrase.rows.length, this.length - position);
		if (to !== undefined) {
			mergeLength = Math.min(mergeLength, to - position + 1);
		}
		const rows = this.rows;
		const mergeRows = mergePhrase.rows;
		for (let i = 0; i < mergeLength; i++) {
			const mergeRow = mergeRows[i];
			if (mergeRow !== undefined) {
				let row = rows[position + i];
				if (row === undefined) {
					row = new Map(mergeRow);
					rows[position + i] = row;
				}
				for (let [key, value] of mergeRow) {
					row.set(key, cloneChange(value));
				}
			}
		}
	}

	mergeCommands(mergePhrase, position, to) {
		let mergeLength = Math.min(mergePhrase.rows.length, this.length - position);
		if (to !== undefined) {
			mergeLength = Math.min(mergeLength, to - position + 1);
		}
		const rows = this.rows;
		const mergeRows = mergePhrase.rows;
		for (let i = 0; i < mergeLength; i++) {
			const mergeRow = mergeRows[i];
			if (mergeRow !== undefined) {
				let row = rows[position + i];
				if (row === undefined) {
					row = new Map(mergeRow);
					rows[position + i] = row;
				}
				for (let [key, value] of mergeRow) {
					if (!noteParameters.has(key)) {
						row.set(key, cloneChange(value));
					}
				}
			}
		}
	}

	mergeNotes(mergePhrase, position, to) {
		let mergeLength = Math.min(mergePhrase.rows.length, this.length - position);
		if (to !== undefined) {
			mergeLength = Math.min(mergeLength, to - position + 1);
		}
		const rows = this.rows;
		const mergeRows = mergePhrase.rows;
		for (let i = 0; i < mergeLength; i++) {
			const mergeRow = mergeRows[i];
			if (mergeRow !== undefined) {
				let row = rows[position + i];
				if (row === undefined) {
					row = new Map(mergeRow);
					rows[position + i] = row;
				}
				for (let [key, value] of mergeRow) {
					if (noteParameters.has(key)) {
						row.set(key, cloneChange(value));
					}
				}
			}
		}
	}

	overwriteAll(replacementPhrase, position, to) {
		let replacementLength = Math.min(mergePhrase.rows.length, this.length - position);
		if (to !== undefined) {
			replacementLength = Math.min(replacementLength, to - position + 1);
		}
		const rows = this.rows;
		const replacementRows = replacementPhrase.rows;
		for (let i = 0; i < replacementLength; i++) {
			rows[position + i] = cloneChanges(replacementRows[i]);
		}
	}

	overwriteCommands(replacementPhrase, position, to) {
		let replacementLength = Math.min(mergePhrase.rows.length, this.length - position);
		if (to !== undefined) {
			replacementLength = Math.min(replacementLength, to - position + 1);
		}
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
			const mergeRow = mergeRows[i];
			if (mergeRow !== undefined) {
				for (let [key, value] of mergeRow) {
					if (!noteParameters.has(key)) {
						row.set(key, cloneChange(value));
					}
				}
			}
		}
	}

	overwriteNotes(replacementPhrase, position, to) {
		let replacementLength = Math.min(mergePhrase.rows.length, this.length - position);
		if (to !== undefined) {
			replacementLength = Math.min(replacementLength, to - position + 1);
		}
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
			const replacementRow = replacementRows[i];
			if (replacementRow !== undefined) {
				for (let [key, value] of replacementRow) {
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
		for (let i = from; i < to; i++) {
			const changes = this.rows[i];
			if (changes === undefined) {
				continue;
			}

			const noteChange = changes.get(Synth.Param.NOTES);
			if (noteChange !== undefined) {
				const changeType = noteChange.type;
				const changeMode = changeType & Synth.CHANGE_TYPE_MASK;
				if (changeMode === Synth.ChangeType.DELTA) {
					const newChange = noteChange.clone();
					changes.set(Synth.Param.NOTES, newChange);
					newChange.value += amount;
				} else if (
					changeType !== Synth.ChangeType.NONE &&
					changeMode === 0
				) {
					const newChange = noteChange.clone();
					changes.set(Synth.Param.NOTES, newChange);
					const notes = newChange.value;
					for (let j = 0; j < notes.length; j++) {
						notes[j] += amount;
					}
				}
			}

			const phraseTransposeChange = changes.get(Synth.Param.PHRASE_TRANSPOSE);
			if (phraseTransposeChange !== undefined) {
				const newChange = phraseTransposeChange.clone();
				changes.set(Synth.Param.PHRASE_TRANSPOSE, newChange);
				newChange.value += amount;
			}
		}
	}

	stepRange(from, to) {
		const length = this.length;
		if (to === undefined) {
			to = from + length - 1;
		} else if (to < from) {
			to += length;
		}
		const numRows = to - from + 1;
		return numRows;
	}

	*find(param, minValue, maxValue, changeTypes, begin, from, to, reverse) {
		if (from === undefined) {
			from = 0;
		}
		let relativeBegin;
		if (begin >= from) {
			relativeBegin = begin - from;
		} else {
			relativeBegin = this.length - from + begin;
		}

		let i = reverse ? 1 : -1; // opposite
		while (true) {
			i += reverse ? -1 : 1;
			const numRows = this.stepRange(from, to);
			if (i === numRows || i === -numRows) {
				break;
			}

			let relativeRow = (relativeBegin + i) % numRows;
			if (relativeRow < 0) {
				relativeRow += numRows;
			}
			const rowNumber = (from + relativeRow) % this.length;
			const changes = this.rows[rowNumber];

			if (changes === undefined) {
				continue;
			}

			const change = changes.get(param);
			if (change === undefined) {
				continue;
			} else if (!changeTypes.has(change.type)) {
				continue;
			}

			const value = change.value;
			if (minValue !== undefined && value < minValue) {
				continue;
			} else if (maxValue !== undefined && value > maxValue) {
				continue;
			}
			reverse = yield [rowNumber, change];
		}
	}

	findAll(param, minValue, maxValue, changeTypes) {
		const search = this.find(param, minValue, maxValue, changeTypes, 0, 0, this.length - 1, false);
		const results = [];
		let result = search.next();
		while (!result.done) {
			results.push(result.value);
			result = search.next(false);
		}
		return results;
	}

	*mirrorValues(param, minValue, maxValue, changeTypes, centreValue, begin, from, to, reverse) {
		const search = this.find(param, minValue, maxValue, changeTypes, begin, from, to, reverse);
		const modified = new Set();
		let result = search.next();
		let doReplace;
		while (!result.done) {
			const occurrence = result.value;
			const rowNumber = occurrence[0];
			const rowChanges = this.rows[rowNumber];
			if (modified.has(rowChanges)) {
				continue;
			}

			[doReplace, reverse] = yield occurrence;
			if (doReplace)  {
				const newChange = occurrence[1].clone();
				this.rows[rowNumber].set(param, newChange);

				const value = newChange.value;
				if (Array.isArray(value)) {
					for (let i = 0; i < value.length; i++) {
						if (value[i] <= centreValue) {
							value[i] = centreValue + (centreValue - value[i]);
						} else {
							value[i] = centreValue - (value[i] - centreValue);
						}
					}
				} else {
					if (value <= centreValue) {
						newChange.value = centreValue + (centreValue - value);
					} else {
						newChange.value = centreValue - (value - centreValue);
					}
				}
				modified.add(rowChanges);
			}
			result = search.next(reverse);
		}
	}

	*multiplyValues(param, minValue, maxValue, changeTypes, multiplier, begin, from, to, reverse) {
		const search = this.find(param, minValue, maxValue, changeTypes, begin, from, to, reverse);
		const modified = new Set();
		let result = search.next();
		let doReplace;
		while (!result.done) {
			const occurrence = result.value;
			const rowNumber = occurrence[0];
			const rowChanges = this.rows[rowNumber];
			if (modified.has(rowChanges)) {
				continue;
			}

			[doReplace, reverse] = yield occurrence;
			if (doReplace)  {
				const newChange = occurrence[1].clone();
				this.rows[rowNumber].set(param, newChange);

				const value = newChange.value;
				if (Array.isArray(value)) {
					for (let i = 0; i < value.length; i++) {
						value[i] *= multiplier;
					}
				} else {
					newChange.value = value * multiplier;
				}
				modified.add(rowChanges);
			}
			result = search.next(reverse);
		}
	}

	*quantizeValues(param, minValue, maxValue, changeTypes, multiple, begin, from, to, reverse) {
		const search = this.find(param, minValue, maxValue, changeTypes, begin, from, to, reverse);
		const modified = new Set();
		let result = search.next();
		let doReplace;
		while (!result.done) {
			const occurrence = result.value;
			const rowNumber = occurrence[0];
			const rowChanges = this.rows[rowNumber];
			if (modified.has(rowChanges)) {
				continue;
			}

			[doReplace, reverse] = yield occurrence;
			if (doReplace)  {
				const newChange = occurrence[1].clone();
				this.rows[rowNumber].set(param, newChange);

				const value = newChange.value;
				if (Array.isArray(value)) {
					for (let i = 0; i < value.length; i++) {
						value[i] = Math.round(value[i] * multiple) / multiple;
					}
				} else {
					newChange.value = Math.round(value * multiple) / multiple;
				}
				modified.add(rowChanges);
			}
			result = search.next(reverse);
		}
	}

	*randomizeValues(param, minValue, maxValue, changeTypes, amount, allowNegative, begin, from, to, reverse) {
		const search = this.find(param, minValue, maxValue, changeTypes, begin, from, to, reverse);
		const modified = new Set();
		let result = search.next();
		let doReplace;
		while (!result.done) {
			const occurrence = result.value;
			const rowNumber = occurrence[0];
			const rowChanges = this.rows[rowNumber];
			if (modified.has(rowChanges)) {
				continue;
			}

			[doReplace, reverse] = yield occurrence;
			if (doReplace)  {
				const newChange = occurrence[1].clone();
				this.rows[rowNumber].set(param, newChange);

				const value = newChange.value;
				if (Array.isArray(value)) {
					for (let i = 0; i < value.length; i++) {
						value[i] = Synth.randomize(value[i], amount, allowNegative);
					}
				} else {
					newChange.value = Synth.randomize(value, amount, allowNegative);
				}
				modified.add(rowChanges);
			}
			result = search.next(reverse);
		}
	}

	*replaceValues(param, minValue, maxValue, changeTypes, replacement, begin, from, to, reverse) {
		const search = this.find(param, minValue, maxValue, changeTypes, begin, from, to, reverse);
		const modified = new Set();
		let result = search.next();
		let doReplace;
		while (!result.done) {
			const occurrence = result.value;
			const rowNumber = occurrence[0];
			const rowChanges = this.rows[rowNumber];
			if (modified.has(rowChanges)) {
				continue;
			}

			[doReplace, reverse] = yield occurrence;
			if (doReplace)  {
				const newChange = occurrence[1].clone();
				this.rows[rowNumber].set(param, newChange);
				newChange.value = replacement;
				modified.add(rowChanges);
			}
			result = search.next(reverse);
		}
	}

	*transposeValues(param, minValue, maxValue, changeTypes, amount, begin, from, to, reverse) {
		const search = this.find(param, minValue, maxValue, changeTypes, begin, from, to, reverse);
		const modified = new Set();
		let result = search.next();
		let doReplace;
		while (!result.done) {
			const occurrence = result.value;
			const rowNumber = occurrence[0];
			const rowChanges = this.rows[rowNumber];
			if (modified.has(rowChanges)) {
				continue;
			}

			[doReplace, reverse] = yield occurrence;
			if (doReplace)  {
				const newChange = occurrence[1].clone();
				this.rows[rowNumber].set(param, newChange);

				const value = newChange.value;
				if (Array.isArray(value)) {
					for (let i = 0; i < value.length; i++) {
						value[i] += amount;
					}
				} else {
					newChange.value = value + amount;
				}
				modified.add(rowChanges);
			}
			result = search.next(reverse);
		}
	}

	*swapValues(param, value1, value2, changeTypes, begin, from, to, reverse) {
		if (from === undefined) {
			from = 0;
		}
		let relativeBegin;
		if (begin >= from) {
			relativeBegin = begin - from;
		} else {
			relativeBegin = this.length - from + begin;
		}

		const modified = new Set();
		let i = reverse ? 1 : -1; // opposite
		let doReplace;
		while (true) {
			i += reverse ? -1 : 1;
			const numRows = this.stepRange(from, to);
			if (i === numRows || i === -numRows) {
				break;
			}

			let relativeRow = (relativeBegin + i) % numRows;
			if (relativeRow < 0) {
				relativeRow += numRows;
			}
			const rowNumber = (from + relativeRow) % this.length;
			const changes = this.rows[rowNumber];

			if (changes === undefined || modified.has(changes)) {
				continue;
			}

			const change = changes.get(param);
			if (change === undefined ||	!changeTypes.has(change.type)) {
				continue;
			}

			const currentValue = change.value;
			if (Synth.equalValues(currentValue, value1)) {
				[doReplace, reverse] = yield [rowNumber, change];
				if (doReplace) {
					const newChange = change.clone();
					changes.set(param, newChange);
					newChange.value = value2;
					modified.add(changes);
				}
			} else if (Synth.equalValues(currentValue, value2)) {
				[doReplace, reverse] = yield [rowNumber, change];
				if (doReplace) {
					const newChange = change.clone();
					changes.set(param, newChange);
					newChange.value = value1;
					modified.add(changes);
				}
			}
		}
	}

	*changeParameter(oldParam, minValue, maxValue, changeTypes, newParam, replaceMin, replaceMax, begin, from, to, reverse) {
		const scale = (replaceMax - replaceMin) / (maxValue - minValue);
		const search = this.find(param, minValue, maxValue, changeTypes, begin, from, to, reverse);
		const modified = new Set();
		let result = search.next();
		let doReplace;
		while (!result.done) {
			const occurrence = result.value;
			const rowNumber = occurrence[0];
			const rowChanges = this.rows[rowNumber];
			if (modified.has(rowChanges)) {
				continue;
			}

			[doReplace, reverse] = yield occurrence;
			if (doReplace)  {
				rowChanges.delete(oldParam);
				const oldValue = occurrence[1];
				const newValue = replaceMin + (oldValue - minValue) * scale;
				rowChanges.set(newParam, newValue);
				modified.add(rowChanges);
			}
			result = search.next(reverse);
		}
	}

	copyParameter(param1, param2, from, to) {
		if (arguments.length === 2) {
			from = 0;
			to = this.rows.length - 1;
		}
		for (let i = from; i <= to; i++) {
			const changes = this.rows[i];
			if (changes !== undefined) {
				const change = changes.get(param1);
				if (change !== undefined) {
					changes.set(param2, cloneChange(change));
				}
			}
		}
	}

	swapParameters(param1, param2, from, to) {
		if (arguments.length === 2) {
			from = 0;
			to = this.rows.length - 1;
		}
		for (let i = from; i <= to; i++) {
			const changes = this.rows[i];
			if (changes !== undefined) {
				const change1 = changes.get(param1);
				const change2 = changes.get(param2);
				if (change1 !== undefined) {
					changes.delete(param1);
					changes.set(param2, change1);
				}
				if (change2 !== undefined) {
					if (change1 === undefined) {
						changes.delete(param2);
					}
					changes.set(param1, change2);
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
		system.beginPattern(step);
		const length = this.length;
		const channel = system.channels[channelNumber];
		let rowNum = 0;
		let loopStart = 0;
		let loopCounter = 1;
		let transpose = 0;
		let lineTime, subphrase, subphraseOffset;

		while (rowNum < length) {
			let changes, subphraseChanges;
			let changeSources = 0;
			let myChanges = this.rows[rowNum];
			if (myChanges !== undefined) {
				const subphraseChange = myChanges.get(Synth.Param.PHRASE);
				if (subphraseChange !== undefined) {
					subphrase = song.getPhrase(subphraseChange.value);
					subphraseOffset = 0;
					transpose = 0;
					if (myChanges.size > 1) {
						changeSources += 4;
					}
				} else {
					changeSources += 4;
				}
				const subphraseOffsetChange = myChanges.get(Synth.Param.PHRASE_OFFSET);
				if (subphraseOffsetChange !== undefined) {
					subphraseOffset = subphraseOffsetChange.value;
				}
			}

			if (subphrase !== undefined) {
				if (subphraseOffset >= subphrase.rows.length) {
					subphrase = undefined;
				} else {
					subphraseChanges = subphrase.rows[subphraseOffset];
					subphraseOffset++;
					if (subphraseChanges !== undefined) {
						changeSources += 2;
					}
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

			let nextRowNum = rowNum + 1;
			const loopChange = changes.get(Synth.Param.LOOP);
			if (loopChange !== undefined) {
				const loopValue = loopChange.value;
				if (loopValue === 0) {
					loopStart = rowNum;
				} else if (loopCounter < loopValue) {
					nextRowNum = loopStart;
					loopCounter++;
				} else {
					loopCounter = 1;
				}
			}
			rowNum = nextRowNum;

			step += lineTime;
		}
	}

}

function replaceAll(iterator) {
	let currentResult = iterator.next();
	while (!currentResult.done) {
		currentResult = iterator.next([true, false]);
	}
}


global.Sequencer = {
	Pattern: Pattern,
	Phrase: Phrase,
	Song: Song,
	cloneChanges: cloneChanges,
	noteParameters: noteParameters,
	replaceAll: replaceAll,
	DIATONIC_SCALE: Object.freeze(DIATONIC_SCALE),
	musicalScale: musicalScale,
};

})(window);
