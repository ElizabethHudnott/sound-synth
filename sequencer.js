(function(global) {
'use strict';

class Song {

	constructor() {
		this.patterns = [];
		this.song = [];
		this.initialParameters = new Map();
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
			cell = new ChangeList();
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

	play(system, step) {
		if (step === undefined) {
			step = system.nextStep();
		}
		const numColumns = this.channelNumbers.length;
		const globalParameters = system.channels[0].parameters;
		let lineTime = globalParameters[Synth.Param.LINE_TIME];

		for (let row of this.rows) {
			if (row !== undefined) {
				lineTime = ChangeList.getTempo(row, lineTime);
				for (let columnNumber = 0; columnNumber < numColumns; columnNumber++) {
					const changes = row[columnNumber];
					if (changes !== undefined) {
						changes.play(system.channels[this.channelNumbers[columnNumber]], step);
					}
				}
			}
			step += lineTime;
		}
	}

}

class ChangeList {

	constructor() {
		this.delay = 0;
		this.instrument = undefined;
		this.changes = 	[];
		this.changeTimes = [];
	}

	getChangesAtTime(step) {
		return this.changes[this.changeTimes.indexOf(step)];
	}

	addChangesAtTime(changes, step) {
		let i = 0;
		while (i < this.changeTimes.length && step < this.changeTimes[i]) {
			i++;
		}
		this.changeTimes.splice(i, 0, step);
		this.changes.splice(i, 0, changes);
	}

	removeChangesAtTime(step) {

	}

	changeTime(oldStep, newStep) {

	}

	play(channel, startStep) {
		startStep = startStep + this.delay;
		for (let i = 0; i < this.changeTimes.length; i++) {
			channel.setParameters(this.changes[i], startStep + this.changeTimes[i]);
		}
	}

	static getTempo(row, lineTime) {
		let i = row.length - 1;
		while (i >= 0) {
			const changeList = row[i];
			if (changeList !== undefined) {
				const changes = changeList.changes[0];
				if (changes !== undefined) {
					const lineTimeChange = changes.get(Synth.Param.LINE_TIME);
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
