(function(global) {
'use strict';

class Song {

	constructor() {
		this.patterns = [new Pattern()];
		this.song = [0];
		this.offsets = [0];
		this.initialParameters = [];
		this.loopFrom = undefined;
	}

	getPattern(number) {
		return this.patterns[number];
	}

	get numberOfPatterns() {
		return this.patterns.length;
	}

	addPattern(pattern) {
		this.patterns.push(pattern);
		return this.patterns.length - 1;
	}

	removePattern(number) {
		this.patterns.splice(number, 1);
		const song = this.song;
		for (let i = 0; i < song.length; i++) {
			const patternNumber = song[i];
			if (patternNumber === number) {
				song[i] = undefined;
			} else if (patternNumber > number) {
				song[i]--;
			}
		}
	}

	getPatternNumber(position) {
		return this.song[position];
	}

	getOffset(position) {
		return this.offsets[position];
	}

	get songLength() {
		return this.song.length;
	}

	insertPatternNumber(position) {
		this.song.splice(position, 0, 0);
		this.offsets.splice(position, 0, 0);
	}

	removePatternNumber(position) {
		this.song.splice(position, 1);
		this.offsets.splice(position, 1);
	}

	play(system, channelMask) {
		let step = system.nextStep();
		for (let i = 0 < this.song.length; i++) {
			const patternNumber = this.song[i];
			if (patternNumber !== undefined) {
				step = this.patterns[patternNumber].play(system, this.offsets[i], channelMask, step);
			}
		}
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
			this.numLines = lineNumber + 1
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

	get numberOfColumns() {
		return this.channelNumbers.length;
	}

	get numberOfLines() {
		return this.numLines;
	}

	set numberOfLines(value) {
		this.rows.splice(value);
		this.numLines = value;
	}

	play(system, offset, channelMask, step) {
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

		let nextRowNum = offset;
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
		step += lineTime * (this.numLines - this.rows.length);
		return step;
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
