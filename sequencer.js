(function(global) {
'use strict';

class Song {

	constructor() {
		this.patterns = [];
		this.song = [];
		this.initialParameters = [];
	}

	play() {

	}

}

class Pattern {

	constructor() {
		this.rows = [];
		this.channelNumbers = [];
		this.numLines = 64;
	}

	addColumn(channelNumber) {
		let columnNumber = this.channelNumbers.length;
		while (channelNumber < this.channelNumbers[columnNumber - 1]) {
			columnNumber--;
		}

		this.channelNumbers.splice(columnNumber, 0, channelNumber);
		for (let row of this.rows) {
			row.splice(columnNumber, 0, undefined);
		}
	}

	removeColumn(columnNumber) {
		for (let row of this.rows) {
			if (row !== undefined) {
				row.splice(columnNumber, 1);
			}
		}
		this.channelNumbers.splice(columnNumber, 1);
	}

	getCell(columnNumber, lineNumber) {
		if (lineNumber >= this.numLines) {
			throw new Error(`Line number ${lineNumber} exceeds the number of lines in the pattern.`);
		}

		let row = this.rows[lineNumber];
		if (row === undefined) {
			row = [];
			this.rows[lineNumber] = row;
		}
		let cell = row[columnNumber];
		if (cell === undefined) {
			cell = new Changes();
			row[columnNumber] = cell;
		}
		return cell;
	}

	get numberOfLines() {
		return this.numLines;
	}

	set numberOfLines(value) {
		this.rows.splice(value);
		this.numLines = value;
	}

	play(system, channelMask, step) {
		if (channelMask === undefined) {
			channelMask = -1
		}
		if (step === undefined) {
			step = system.nextStep();
		}
		const numColumns = this.channelNumbers.length;
		const globalParameters = system.channels[0].parameters;
		let lineTime = globalParameters[Synth.Param.LINE_TIME];
		let loopStart = 0, loopIndex = 1;

		let nextRowNum = 0;
		while (nextRowNum < this.rows.length) {
			const row = this.rows[nextRowNum];
			nextRowNum++;
			if (row !== undefined) {
				let changes = row[0];
				if (changes !== undefined) {
					if (changes.changes.has(Synth.Param.LOOP_START)) {
						loopStart = nextRowNum - 1; // invert nextRowNum++ above
					}
					if (changes.changes.has(Synth.Param.LOOPS)) {
						const numLoops = changes.changes.get(Synth.Param.LOOPS).value;
						if (loopIndex < numLoops) {
							nextRowNum = loopStart;
							loopIndex++;
						} else {
							loopIndex = 1;
						}
					}
					changes.play(system.channels[this.channelNumbers[0]], step);
				}
				for (let columnNumber = 1; columnNumber < numColumns; columnNumber++) {
					if ((channelMask & (1 << columnNumber)) !== 0) {
						changes = row[columnNumber];
						if (changes !== undefined) {
							changes.play(system.channels[this.channelNumbers[columnNumber]], step);
						}
					}
				}
				lineTime = Changes.getTempo(row, lineTime);
			}
			step += lineTime;
		}
	}

}

class Changes {

	constructor() {
		this.instrument = undefined;
		this.changes = new Map();
	}

	play(channel, step) {
		channel.setParameters(this.changes, step);
	}

	static getTempo(row, lineTime) {
		let i = row.length - 1;
		while (i >= 0) {
			const changes = row[i];
			if (changes !== undefined) {
				const parameterMap = changes.changes;
				if (parameterMap !== undefined) {
					const lineTimeChange = parameterMap.get(Synth.Param.LINE_TIME);
					if (lineTimeChange !== undefined) {
						switch (lineTimeChange.type) {
						case Synth.ChangeType.DELTA:
							return lineTime + lineTimeChange.value;

						case Synth.ChangeType.MULTIPLY:
							return lineTime * lineTimeChange.value;

						default:
							return lineTimeChange.value;
						}
					}
				}
			}
			i--;
		}
		return lineTime;
	}

}

global.Sequencer = {
	Pattern: Pattern,
	Song: Song,
};

})(window);
