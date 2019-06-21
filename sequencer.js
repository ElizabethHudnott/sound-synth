(function(global) {
'use strict';

const defaultChanges = new Map();

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

	addPhrase(phrase) {
		this.phrases.set(phrase.name, phrase);
	}

	removePhrase(phrase) {
		this.phrases.delete(phrase.name);
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

				switch (changeSources) {
				case 0:
					changes = defaultChanges;
					break;
				case 1:
					changes = masterChanges;
					break;
				case 2:
					changes = phraseChanges;
					break;
				default:
					changes = new Map(masterChanges);
					if (phraseChanges !== undefined) {
						for (let [key, change] of phraseChanges) {
							if (change !== Synth.Change.MARK || !changes.has(key)) {
								changes.set(key, change);
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
			const newChange = copy === false ? change : change.clone();
			changes.set(param, newChange);
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
			switch (changeSources) {
			case 0:
				changes = defaultChanges;
				break;
			case 2:
				changes = subphraseChanges;
				break;
			default:
				changes = new Map(subphraseChanges);
				for (let [key, change] of myChanges) {
					if (change === Synth.Change.NONE) {
						changes.delete(key);
					} else if (change !== Synth.Change.MARK || !changes.has(key)) {
						changes.set(key, change);
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
};

})(window);
