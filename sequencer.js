(function(global) {
'use strict';

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
				step = pattern.play(system, step);
			}
		}
	}

}

class Pattern {
	static defaultChanges = new Map();

	constructor(numColumns, length) {
		if (length === undefined) {
			length = 64;
		}
		// Column 0 is the master column
		this.columns = new Array(numColumns);
		this.offsets = new Array(numColumns);
		for (let i = 0; i < numColumns; i++) {
			this.offsets[i] = 0;
		}
		this.length = length;
	}

	addColumn() {
		const columnNumber = this.columns.length;
		this.offsets[columnNumber] = 0;
	}

	removeColumn(columnNumber) {
		this.columns.splice(columnNumber, 1);
		this.offsets.splice(columnNumber, 1);
	}

	get numberOfColumns() {
		return this.offsets.length;
	}

	play(system, step) {
		if (step === undefined) {
			step = system.nextStep();
		}

		const numColumns = this.columns.length;
		const length = this.length;
		const masterColumn = this.columns[0];
		const masterOffset = this.offsets[0];
		const highChannelParams = system.channels[numColumns - 2].parameters;

		let lineTime, numTicks;
		let loopStart = 0, loopIndex = 1;

		let rowNum = 0;
		while (rowNum < length) {
			const masterChanges = masterColumn[rowNum + masterOffset];
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
				let changes;
				if (column !== undefined) {
					const columnChanges = column.rows[rowNum + this.offsets[columnNumber]];
					if (columnChanges !== undefined) {
						if (masterChanges === undefined) {
							changes = columnChanges;
						} else {
							changes = new Map(masterChanges);
							for (let [key, value] of columnChanges) {
								if (value !== Synth.Change.MARK || !changes.has(key)) {
									changes.set(key, value);
								}
							}
						}
					}
				}
				if (changes === undefined) {
					if (masterChanges === undefined) {
						changes = Pattern.defaultChanges;
					} else {
						changes = masterChanges;
					}
				}
				lineTime = system.channels[columnNumber - 1].setParameters(changes, step, true);
			}

			numTicks = highChannelParams[Synth.Param.TICKS];
			if (numTicks > lineTime) {
				numTicks = lineTime;
			}
			step += lineTime * (1 + patternDelay / numTicks);
			rowNum = nextRowNum;
		}
		return step;
	}

}

class Phrase {
	static EMPTY = new Phrase('Empty', 0);

	constructor(name, length) {
		this.name = name;
		this.rows = [];
		this.length = length;
	}

	play(system, channelNumber, step) {
		if (channelNumber === undefined) {
			channelNumber = 0;
		}
		if (step === undefined) {
			step = system.nextStep();
		}
		const channel = system.channels[channelNumber];
		const emptyMap = new Map();
		let lineTime;

		for (let row of this.rows) {
			if (row) {
				lineTime = channel.setParameters(row, step, true);
			} else {
				lineTime = channel.setParameters(emptyMap, step, true);
			}
			step += lineTime;
		}
	}
}

global.Sequencer = {
	Pattern: Pattern,
	Phrase: Phrase,
	Song: Song,
};

})(window);
