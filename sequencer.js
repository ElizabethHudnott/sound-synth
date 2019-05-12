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
		for (let i = 0; i < this.song.length; i++) {
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
		this.master = []; // master column
		this.channelNumbers = [];
		this.numLines = 64;
	}

	addColumn(channelNumber) {
		let columnNumber = this.channelNumbers.length;
		while (channelNumber < this.channelNumbers[columnNumber - 1]) {
			columnNumber--;
		}

		this.channelNumbers.splice(columnNumber, 0, channelNumber);
		for (let i = 0; i < this.rows.length; i++) {
			const row = rows[i];
			const masterParameters = this.master[i];
			if (masterParameters !== undefined) {
				row.splice(columnNumber, 0, new Change(new Map(masterParameters)));
			} else if (row !== undefined) {
				row.splice(columnNumber, 0, undefined);
			}
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

	setMasterParameters(lineNumber, parameters) {
		let masterParameters = this.master[lineNumber];
		let row = this.rows[lineNumber];
		if (masterParameters === undefined) {
			masterParameters = new Map();
		}
		if (row === undefined) {
			row = [];
			this.rows[lineNumber] = row;
		}

		for (let i = 0; i < this.channelNumbers.length; i++) {
			let cell = row[i];
			if (cell === undefined) {
				row[i] = new Changes(new Map(parameters));
			} else {
				for (let [key, value] of parameters) {
					const currentMasterValue = masterParameters.get(key);
					const cellValue = cell.parameters.get(key);
					if (currentMasterValue === undefined || currentMasterValue.equals(cellValue)) {
						cell.parameters.set(key, value);
					}
				}
				for (let [key, value] of masterParameters) {
					if (!parameters.has(key)) {
						if (value.equals(cell.parameters.get(key))) {
							cell.parameters.delete(key);
						}
					}
				}
			}
		}
		this.master[lineNumber] = new Map(parameters);
	}

	getMasterParameters(lineNumber) {
		const masterParameters = this.masterParameters[lineNumber];
		return new Map(masterParameters);
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
		let lineTime = system.globalParameters[0];
		let numTicks = system.globalParameters[1];
		let loopStart = 0, loopIndex = 1;

		for (let channelNumber of this.channelNumbers) {
			const channelParams = system.channels[channelNumber].parameters;
			channelParams[Synth.Param.LINE_TIME] = lineTime;
			channelParams[Synth.Param.TICKS] = numTicks;
		}

		let nextRowNum = offset;
		let patternDelay;
		while (nextRowNum < this.rows.length) {
			const row = this.rows[nextRowNum];
			const masterChanges = this.master[nextRowNum];
			nextRowNum++;
			patternDelay = 0;
			if (masterChanges !== undefined) {
				if (masterChanges.has(Synth.Param.LOOP_START)) {
					loopStart = nextRowNum - 1; // invert nextRowNum++ above
				}
				const numLoopsChange = masterChanges.get(Synth.Param.LOOPS);
				if (numLoopsChange !== undefined) {
					if (loopIndex < numLoopsChange.value) {
						nextRowNum = loopStart;
						loopIndex++;
					} else {
						loopIndex = 1;
					}
				}
				const patternDelayChange = masterChanges.get(Synth.Param.PATTERN_DELAY);
				if (patternDelayChange !== undefined) {
					patternDelay = patternDelayChange.value;
				}
			}
			if (row !== undefined) {
				for (let columnNumber = 0; columnNumber < numColumns; columnNumber++) {
					if ((channelMask & (1 << columnNumber)) !== 0) {
						const changes = row[columnNumber];
						if (changes !== undefined) {
							changes.play(system.channels[this.channelNumbers[columnNumber]], step);
						}
					}
				}
				lineTime = system.globalParameters[0];
			}
			step += lineTime * (1 + patternDelay);
		}
		step += lineTime * (this.numLines - this.rows.length);
		return step;
	}

}

class Changes {

	constructor(parameters) {
		this.instrument = undefined;
		if (parameters === undefined) {
			this.parameters = new Map();
		} else {
			this.parameters = parameters;
		}
	}

	play(channel, step) {
		channel.setParameters(this.parameters, step);
	}

}

global.Sequencer = {
	Pattern: Pattern,
	Song: Song,
};

})(window);
