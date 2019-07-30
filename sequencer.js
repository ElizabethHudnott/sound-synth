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

function equalValues(a, b) {
	if (Array.isArray(a)) {
		if (!Array.isArray(b)) {
			return false;
		}
		const length = a.length;
		if (length !== b.length) {
			return false;
		}
		for (let i = 0; i < length; i++) {
			if (a[i] !== b[i]) {
				return false;
			}
		}
		return true;
	} else {
		return a === b;
	}
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

	equals(pattern) {
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

		const pattern = new Pattern(offsets.length - 1, length);
		pattern.columns = columns;
		pattern.offsets = offsets;
		return pattern;
	}

	play(system, song, step) {
		if (step === undefined) {
			step = system.nextStep();
		}

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
				const loopChange = masterChanges.get(Synth.Param.LOOP);
				if (loopChange !== undefined) {
					const loopValue = loopChange.value;
					if (loopValue === 0) {
						loopStart = rowNum;
					} else if (loopIndex < loopValue) {
						nextRowNum = loopStart;
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

	equals(phrase) {
		if (this.length !== phrase.length) {
			return false;
		}
		const thisRows = this.rows;
		const phraseRows = phrase.rows;
		const minLength = Math.min(thisRows.length, phraseRows.length);
		for (let i = 0; i < minLength; i++) {
			if (!equalChanges(thisRows[i], phraseRows[i])) {
				return false;
			}
		}
		const longerPhrase = thisRows.length >= minLength ? this : phrase;
		const longerRows = longerPhrase.rows;
		const maxLength = longerRows.length;
		for (let i = minLength; i < maxLength; i++) {
			if (longerRows[i] !== undefined) {
				return false;
			}
		}
		return true;
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
		for (let i = from; i < to; i++) {
			const changes = this.rows[i];
			if (changes === undefined) {
				continue;
			}

			const noteChange = changes.get(Synth.Param.NOTES);
			if (noteChange !== undefined) {
				const changeType = noteChange.type;
				const prefix = changeType[0];
				if (prefix === Synth.ChangeType.DELTA) {
					const newChange = noteChange.clone();
					changes.set(Synth.Param.NOTES, newChange);
					newChange.value += amount;
				} else if (
					changeType !== Synth.ChangeType.NONE &&
					prefix !== Synth.ChangeType.MULTIPLY &&
					prefix !== Synth.ChangeType.MARK
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

	stepRange(from, to, reverse) {
		const length = this.length;
		if (to === undefined) {
			to = from + length - 1;
		} else if (to < from) {
			to += length;
		}
		let numRows;
		if (reverse) {
			from += length;
			to += length;
			numRows = from - to + 1
		} else {
			numRows = to - from + 1;
		}
		if (numRows <= 0) {
			numRows += length;
		}
		return [from, numRows];
	}

	*find(param, minValue, maxValue, changeTypes, from, to, reverse) {
		const increment = reverse ? -1 : 1;
		const equalMinMax = minValue !== undefined && equalValues(minValue, maxValue);
		let i = -1, revisedFrom, numRows;

		while (true) {
			[revisedFrom, numRows] = this.stepRange(from, to, reverse);
			i++;
			if (i >= numRows) {
				break;
			}

			const rowNumber = (revisedFrom + increment * i) % this.length;
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
			if (equalMinMax && !equalValues(value, minValue)) {
				// Handle arrays
				continue;
			} else if (minValue !== undefined && value < minValue) {
				continue;
			} else if (maxValue !== undefined && value > maxValue) {
				continue;
			}
			yield [rowNumber, change];
		}
	}

	findAll(param, minValue, maxValue, changeTypes) {
		const results = [];
		for (let result of this.find(param, minValue, maxValue, changeTypes, 0, this.rows.length - 1, false)) {
			results.push(result);
		}
		return results;
	}

	static replaceAll(iterator, currentResult) {
		if (currentResult === undefined) {
			currentResult = iterator.next();
		}
		while (!currentResult.done) {
			currentResult = iterator.next(true);
		}
	}

	*mirrorValues(param, minValue, maxValue, changeTypes, from, to, reverse) {

	}

	*multiplyValues(param, minValue, maxValue, changeTypes, multiplier, from, to, reverse) {

	}

	*quantizeValues(param, minValue, maxValue, changeTypes, multiple, from, to, reverse) {

	}

	*randomizeValues(param, minValue, maxValue, changeTypes, amount, allowNegative, from, to, reverse) {

	}

	*replaceValues(param, minValue, maxValue, changeTypes, replacement, from, to, reverse) {
		for (let occurrence of this.find(param, minValue, maxValue, changeTypes, from, to, reverse)) {
			const doReplace = yield occurrence;
			if (doReplace)  {
				const newChange = occurrence[1].clone();
				this.rows[occurrence[0]].set(param, newChange);
				newChange.value = replacement;
			}
		}
	}

	*transposeValues(param, minValue, maxValue, changeTypes, amount, from, to, reverse) {
		for (let occurrence of this.find(param, minValue, maxValue, changeTypes, from, to, reverse)) {
			const doReplace = yield occurrence;
			if (doReplace)  {
				const newChange = occurrence[1].clone();
				this.rows[occurrence[0]].set(param, newChange);

				const value = newChange.value;
				if (Array.isArray(value)) {
					for (let i = 0; i < value.length; i++) {
						value[i] += amount;
					}
				} else {
					newChange.value += amount;
				}
			}
		}
	}

	swapValues(param, value1, value2, changeTypes, from, to) {
		const numArgs = arguments.length;
		if (numArgs < 5) {
			from = 0;
			to = this.rows.length - 1;
			if (numArgs === 3) {
				changeType = Synth.ChangeType.SET;
			}
		}
		for (let i = from; i <= to; i++) {
			const changes = this.rows[i];
			if (changes === undefined) {
				continue;
			}

			const change = changes.get(param);
			if (change === undefined) {
				continue;
			} else if (!changeTypes.has(change.type)) {
				continue;
			}

			const currentValue = change.value;
			if (equalValues(currentValue, value1)) {
				const newChange = change.clone();
				changes.set(param, newChange);
				newChange.value = value2;
			} else if (equalValues(currentValue, value2)) {
				const newChange = change.clone();
				changes.set(param, newChange);
				newChange.value = value1;
			}
		}
	}

	changeParameter(oldParam, newParam, from, to) {
		if (arguments.length === 2) {
			from = 0;
			to = this.rows.length - 1;
		}
		for (let i = from; i <= to; i++) {
			const changes = this.rows[i];
			if (changes !== undefined) {
				const change = changes.get(oldParam);
				if (change !== undefined) {
					changes.delete(oldParam);
					changes.set(newParam, change);
				}
			}
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
		const length = this.length;
		const channel = system.channels[channelNumber];
		let transpose = 0;
		let lineTime, subphrase, subphraseOffset;

		for (let rowNum = 0; rowNum < length; rowNum++) {
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
