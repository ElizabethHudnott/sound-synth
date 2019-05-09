(function(global) {
'use strict';

class Song {

	constructor() {
		this.lineTime = 24; // TODO read default value directly from the synth.
		this.patterns = [];
		this.song = [];
		this.initialParameters = new Map();
	}

	play() {

	}

}

class Pattern {

	constructor(numLines) {
		this.rows = [];
		this.channelNumbers = [];
		this.numLines = numLines;
	}

	addColumn(channelNumber, columnNumber) {
		if (columnNumber === undefined) {
			this.channelNumbers.push(channelNumber);
		} else {
			for (let row of this.rows) {
				row.splice(columnNumber, 0, undefined);
			}
			this.channelNumbers.splice(columnNumber, 0, channelNumber);
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
		const numColumns = this.channelNumbers.length;
		for (let row of this.rows) {
			if (row !== undefined) {
				for (let columnNumber = 0; columnNumber < numColumns; columnNumber++) {
					const changes = row[columnNumber];
					if (changes !== undefined) {
						changes.play(system.channels[this.channelNumbers[columnNumber]], step);
					}
				}
			}
			step += 24;
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

	getChangesAtTime(ticks) {
		return this.changes[this.changeTimes.indexOf(ticks)];
	}

	addChangesAtTime(changes, ticks) {
		let i = 0;
		while (i < this.changeTimes.length && i < this.changeTimes[i]) {
			i++;
		}
		this.changeTimes.splice(i, 0, ticks);
		this.changes.splice(i, 0, changes);
	}

	removeChangesAtTime(ticks) {

	}

	changeTime(oldTicks, newTicks) {

	}

	play(channel, startStep) {
		startStep = startStep + this.delay;
		for (let i = 0; i < this.changeTimes.length; i++) {
			channel.setParameters(this.changes[i], startStep + this.changeTimes[i]);
		}
	}

}

global.Sequencer = {
	Pattern: Pattern,
	Song: Song,
};

})(window);
