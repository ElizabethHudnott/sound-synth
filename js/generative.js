'use strict';

function makeCDF(map) {
	const keys = [];
	const cumulativeProbabilities = [];
	let total = 0;
	for (let frequency of map.values()) {
		total += frequency;
	}
	let sum = 0;
	for (let [key, frequency] of map.entries()) {
		keys.push(key);
		sum += frequency / total;
		cumulativeProbabilities.push(sum);
	}
	return [cumulativeProbabilities, keys];
}

function cdfLookup(distribution) {
	const probability = Math.random();
	const probabilities = distribution[0];
	const values = distribution[1];
	const length = probabilities.length;
	let i = 0;
	while (i < length - 1 && probabilities[i] < probability) {
		i++
	}
	return values[i];
}

function uniformCDF(from, to) {
	const n = to - from + 1;
	const values = new Array(n);
	const cumulativeProbabilities = new Array(n);
	for (let i = 0; i < n; i++) {
		values[i] = from + i;
		cumulativeProbabilities[i] = (i + 1) / n;
	}
	return [cumulativeProbabilities, values];
}

function expectedValue(distribution) {
	const probabilities = distribution[0];
	const values = distribution[1];
	const numValues = values.length;
	let previousProbability = 0;
	let sum = 0;
	for (let i = 0; i < numValues; i++) {
		const probability = probabilities[i];
		sum += values[i] * (probability - previousProbability);
		previousProbability = probability;
	}
	return sum;
}

function generatePitchSpace(scale, baseNote, minNote, maxNote) {
	const scaleLength = scale.length;
	const highPitches = [];
	const lowPitches = [];
	let index = 0;
	let note = baseNote;
	while (note <= maxNote) {
		if (note >= minNote) {
			highPitches.push(note);
		}
		note = note + scale[index];
		index = (index + 1) % scaleLength;
	}
	index = scaleLength - 1;
	note = baseNote - scale[index];
	while (note >= minNote) {
		if (note <= maxNote) {
			lowPitches.push(note);
		}
		index--;
		if (index === -1) {
			index = scaleLength - 1;
		}
		note = note - scale[index];
	}
	return lowPitches.reverse().concat(highPitches);
}

const TimeSignatureType = Object.freeze({
	SIMPLE: 1,
	COMPLEX: 2,
	COMPOUND: 3,
});

class TimeSigature {
	constructor(type, length, beatLength, groupings) {
		this.type = type;
		this.length = length;
		this.beatLength = beatLength;
		this.groupings = groupings;
	}
}

const RhythmType = Object.freeze({
	UNCONSTRAINED: 0,
	FIRST_BAR: 1,
	REPEATED: 2,
});

class SongGenerator {
	constructor() {
		// Approximate length in quavers.
		this.lengthDist = uniformCDF(3, 10);

		/* Frequency distribution of duplets and triplets for complex time signatures
		 * (and maybe quintuplets or septuplets).
		 */
		this.subdivisionDist = makeCDF(new Map([[2, 2], [3, 1]]));

		/* Distribution of eighth notes (1), half notes (4), etc. */
		this.beatDist = makeCDF(new Map([
			[1, 12], [2, 6], [3, 4], [4, 3], [6, 2]
		]));

		// Distribution of rests, assuming a 16 beat length
		this.restTimeDist = uniformCDF(0, 6);

		this.minNote = 47; // B2
		this.maxNote = 70; // A#4
		this.modeDist = uniformCDF(1, 7); // The scale degree, 1 = major, 2 = dorian, 6 = minor, etc.

		this.contourDist = makeCDF(new Map([
			['=', 10], ['+', 30], ['-', 21], ['--', 9], ['+-', 15], ['-+', 15],
		]));

		this.conjunctLength = uniformCDF(2, 5);
		this.conjunctIntervals = makeCDF(new Map([
			[1, 67], [2, 33],
		]));

		this.disjunctLength = uniformCDF(2, 3);
		this.disjunctIntervals = makeCDF(new Map([
			[4, 1], [5, 1], [6, 1],
		]));

		this.numConjunctContours = 3;
		this.numDisjunctContours = 3;
		this.conjunctDistance = 2;

		this.patternDist = makeCDF(new Map([
			['conjunct', 1], ['disjunct', 1], ['mixed', 1],
		]));
		this.conjunctProbability = 0.8; // within mixed phrases

		/* 0 = staccato
		 * 1 = legato
		 * 0.5 < x < 1 represent intermediate qualities
		 * 0 < x <= 0.5 probably aren't musically valid?
		 */
		this.articulation = 0.75;

		this.offbeatVelocity = 80;

		this.structureDist = makeCDF(new Map([
			[[0]									, 6],
			[[0, 1]			/* AB binary form */	, 2],
			[[0, 1, 0]		/* ABA ternary form */	, 2],
			[[0, 1, 0, 1]	/* ABAB */				, 1],
			[[0, 1, 0, 2]	/* ABAC */				, 1],
		]));

		// Probability of repetition in the song structure
		this.repeatProbability = 0.5;

		// Probability of using strophic form at the super structure level
		this.variationsProbability = 1/7;

		// Probability of generating a rondo
		this.rondoProbability = 0.2;

		this.variationProbability = 0.5;
	}

	generateTimeSignature(type) {
		let length = cdfLookup(this.lengthDist);
		let beatLength = 1, lengths;
		if (type === undefined) {
			type = Math.trunc(Math.random() * 3) + 1;
		}
		switch (type) {
		case TimeSignatureType.SIMPLE:
			// 1 = quavers as the basic note (x/8 time), 2 = crotchet (x/4 time), etc.
			beatLength = 2 ** Math.trunc(Math.random() * 3);
			while (length % beatLength !== 0) {
				beatLength /= 2;
			}
			lengths = new Array(length);
			lengths.fill(1);
			break;

		case TimeSignatureType.COMPOUND:
			length = Math.min(Math.round(length / 3) * 3, 6);
			lengths = new Array(length / 3);
			lengths.fill(3);
			break;

		case TimeSignatureType.COMPLEX:
			lengths = [];
			let lengthSoFar = 0;
			while (lengthSoFar < length - 1 || lengths.length < 2) {
				const subdivision = cdfLookup(this.subdivisionDist);
				lengths.push(subdivision);
				lengthSoFar += subdivision;
			}
			let allTheSame = true;
			for (let i = 1; i < lengths.length; i++) {
				if (lengths[i] !== lengths[0]) {
					allTheSame = false;
					break;
				}
			}
			if (allTheSame) {
				const subdivisions = this.subdivisionDist[1];
				lengthSoFar -= lengths[1];
				lengths[1] = subdivisions[0];
				if (lengths[0] === lengths[1]) {
					lengths[1] = subdivisions[1];
				}
				lengthSoFar += lengths[1];
			}
			length = lengthSoFar;
			break;
		}
		return new TimeSigature(type, length, beatLength, lengths);
	}

	generateRhythm(timeSignature, rhythmType) {
		const timeSignatureType = timeSignature.type;
		const length = timeSignature.length;
		const mainBeatLength = timeSignature.beatLength;
		let lengths = timeSignature.groupings.slice();
		let numBlocks = lengths.length;
		let noteValues = [];

		if (timeSignatureType === TimeSignatureType.SIMPLE) {
			let i = 0, offset = 0, owed = 0;
			let beatLength;
			while (i < numBlocks) {
				if (owed > numBlocks - i) {
					owed = 0;
				}
				if (owed === 0) {
					beatLength = cdfLookup(this.beatDist);
				} else {
					beatLength = owed;
				}
				if ((offset + beatLength > mainBeatLength && offset !== 0) ||
					beatLength > numBlocks - i || beatLength > numBlocks - 1
				) {
					if (owed === 0) {
						owed = beatLength;
					}
					do {
						beatLength = cdfLookup(this.beatDist);
					} while ((offset + beatLength > mainBeatLength && offset !== 0) || beatLength > numBlocks - i || beatLength > numBlocks - 1)
				}
				if (beatLength === owed) {
					owed = 0;
				}

				if (beatLength > 1) {
					lengths.splice(i, beatLength, beatLength);
					numBlocks -= beatLength - 1;
				}
				noteValues[i] = [beatLength];
				offset = (offset + beatLength) % mainBeatLength;
				i++;
			}
			lengths = [];
			const newValues = [];
			let currentBlock = noteValues[0];
			let numEighths = noteValues[0][0];
			for (let i = 1; i < numBlocks; i++) {
				if (numEighths % mainBeatLength === 0) {
					newValues.push(currentBlock);
					lengths.push(numEighths);
					currentBlock = [];
					numEighths = 0;
				}
				const value = noteValues[i][0];
				currentBlock.push(value);
				numEighths += value;
			}
			newValues.push(currentBlock);
			lengths.push(numEighths);
			noteValues = newValues;
			numBlocks = lengths.length;

		} else {

			// Compound and complex signatures
			let i = 0, owed = 0, beatLength;
			while (i < numBlocks) {
				const subdivision = lengths[i];
				if (owed === 0) {
					beatLength = cdfLookup(this.beatDist);
				} else {
					beatLength = owed;
				}
				while ((beatLength > 2 && beatLength !== 4) ||
					(beatLength === 4 && (numBlocks === 2 || subdivision !== lengths[i + 1]))
				) {
					if (beatLength === 4) {
						owed = 4;
					}
					beatLength = cdfLookup(this.beatDist);
				}
				if (beatLength === owed) {
					owed = 0;
				}

				let beats;
				switch (beatLength) {
				case 1:
					beats = new Array(subdivision);
					beats.fill(1);
					break;

				case 2:
					beats = [subdivision];
					break;

				case 4:
					beats = [2 * subdivision];
					lengths.splice(i, 2, 2 * subdivision);
					numBlocks--;
					break;
				}
				noteValues[i] = beats;
				i++;
			}
		}

		// Use negative "beat lengths" to indicate rests.
		let restsToAllocate = Math.round(cdfLookup(this.restTimeDist) * length / 16);
		let attempts = 0;
		while (restsToAllocate !== 0 && attempts < 100) {
			const index = Math.trunc(Math.random() * length);
			let currentIndex = 0;
			for (let i = 0; i < numBlocks; i++) {
				const blockLength = lengths[i];
				if (index < currentIndex + blockLength) {
					const beats = noteValues[i];
					const blockLength = beats.length;
					if (restsToAllocate > 0) {
						for (let indexWithinBlock = blockLength - 1; indexWithinBlock >= 0; indexWithinBlock--) {
							const beatLength = beats[indexWithinBlock];
							if (beatLength > 0) {
								beats[indexWithinBlock] = -beatLength;
								restsToAllocate -= beatLength;
								break;
							}
						}
					} else {
						for (let indexWithinBlock = 0; indexWithinBlock < blockLength; indexWithinBlock++) {
							const beatLength = beats[indexWithinBlock];
							if (beatLength < 0) {
								beats[indexWithinBlock] = -beatLength;
								restsToAllocate -= beatLength;
								break;
							}
						}
					}
					break;
				}
				currentIndex += blockLength;
			}
			attempts++;
		}

		// Make the longest note be on the beat (no syncopation for now)
		for (let i = 0; i < numBlocks; i++) {
			const block = noteValues[i];
			const first = block[0];
			const max = Math.max(...block);
			if (first !== max) {
				const index = block.indexOf(max);
				block[index] = first;
				block[0] = max;
			}
		}

		let startBlock = 0;

		switch (rhythmType) {
		case RhythmType.FIRST_BAR:
			{
				while (noteValues[startBlock][0] < 0 && startBlock < numBlocks - 1) {
					startBlock++;
				}
				if (noteValues[startBlock][0] < 0) {
					startBlock = 0;
					noteValues[0][0] = -noteValues[0][0];
				}
				break;
			}

		case RhythmType.REPEATED:
			{
				let maxRestLength = 0;
				let maxLastNoteLength = 0;
				let maxRestBlock;
				let maxNoteLength = 0;
				let maxNoteBlock = 0;
				for (let i = 0; i < numBlocks; i++) {
					let block = noteValues[i];
					let blockLength = block.length;
					let restLength = 0;
					let lastNoteLength = 0;
					for (let j = 0; j < blockLength; j++) {
						if (block[j] < 0) {
							restLength += -block[j];
						} else {
							lastNoteLength = block[j];
						}
					}
					if (lastNoteLength > maxNoteLength) {
						maxNoteLength = lastNoteLength;
						maxNoteBlock = i;
					}

					let blockNum = (i + 1) % numBlocks;
					while (blockNum !== i) {
						block = noteValues[blockNum];
						blockLength = block.length;
						if (block[0] > 0) {
							break;
						}
						for (let j = 0; j < blockLength; j++) {
							restLength += -block[j];
						}
						blockNum = (blockNum + 1) % numBlocks;
					}
					if (restLength > maxRestLength || (restLength === maxRestLength && lastNoteLength > maxLastNoteLength)) {
						maxRestLength = restLength;
						maxRestBlock = blockNum;
						maxLastNoteLength = lastNoteLength;
					}
				}

				if (maxRestBlock !== undefined) {
					startBlock = maxRestBlock;
				} else {
					startBlock = maxNoteBlock;
				}
				break;
			}
		}

		if (startBlock > 0) {
			const newValues = [];
			let i = startBlock;
			do {
				newValues.push(noteValues[i]);
				i = (i + 1) % numBlocks;
			} while (i !== startBlock);
			noteValues = newValues;
		}

		console.log('Blocks: ' + lengths);
		console.log('Rhythm: ' + noteValues.flat());

		return noteValues;
	}

	generateScale() {
		const mode = cdfLookup(this.modeDist) - 1;
		const scale = new Array(7);
		for (let i = 0; i < 7; i++) {
			scale[i] = Sequencer.DIATONIC_SCALE[(i + mode - 1) % 7];
		}
		return scale;
	}

	generateContour(conjunctive) {
		const type = cdfLookup(this.contourDist);
		const lengthDist = conjunctive ? this.conjunctLength : this.disjunctLength;
		const intervalDist = conjunctive ? this.conjunctIntervals : this.disjunctIntervals;
		let length = cdfLookup(lengthDist);
		const intervals = [0];
		let position = 0;
		switch (type) {
		case '=':
			if (conjunctive && length === 2) {
				intervals.push(0);
			} else {
				let sign = Math.random() < 0.5 ? -1 : 1;
				for (let i = 1; i < length; i++) {
					const interval = cdfLookup(intervalDist) - 1;
					position += sign * interval;
					intervals.push(position);
					if (interval !== 0) {
						sign = -sign;
					}
				}
			}
			break;

		case '+':
			for (let i = 1; i < length; i++) {
				const interval = cdfLookup(intervalDist) - 1;
				position += interval;
				intervals.push(position);
			}
			break;

		case '-':
			for (let i = 1; i < length; i++) {
				const interval = cdfLookup(intervalDist) - 1;
				position -= interval;
				intervals.push(position);
			}
			break;

		case '--':
			for (let i = 1; i < length; i++) {
				const interval = cdfLookup(intervalDist) - 1;
				position -= interval;
				intervals.push(position);
			}
			position = Math.trunc(Math.random() * (position + 1)) - 1
			intervals.push(position);
			length = cdfLookup(lengthDist);
			for (let i = 1; i < length; i++) {
				const interval = cdfLookup(intervalDist) - 1;
				position -= interval;
				intervals.push(position);
			}
			break;

		case '+-':
			for (let i = 1; i < length; i++) {
				const interval = cdfLookup(intervalDist) - 1;
				position += interval;
				intervals.push(position);
			}
			length = cdfLookup(lengthDist);
			for (let i = 1; i < length; i++) {
				const interval = cdfLookup(intervalDist) - 1;
				position -= interval;
				intervals.push(position);
			}
			break;

		case '-+':
			for (let i = 1; i < length; i++) {
				const interval = cdfLookup(intervalDist) - 1;
				position -= interval;
				intervals.push(position);
			}
			length = cdfLookup(lengthDist);
			for (let i = 1; i < length; i++) {
				const interval = cdfLookup(intervalDist) - 1;
				position += interval;
				intervals.push(position);
			}
			break;
		}
		return intervals;
	}

	static putContourInPitchSpace(contour, pitches) {
		const length = contour.length;
		const numPitches = pitches.length;
		let min = contour[0];
		let max = contour[0];
		for (let i = 1; i < length; i++) {
			const offset = contour[i];
			if (offset < min) {
				min = offset;
			} else if (offset > max) {
				max = offset;
			}
		}

		const output = [];
		for (let i = -min; i < numPitches - max; i++) {
			const run = [];
			for (let j = 0; j < length; j++) {
				run.push(pitches[i + contour[j]]);
			}
			output.push(run);
		}
		return output;
	}

	generateMelody(pitchSpace, conjunctPatterns, disjunctPatterns, type, lastPitch, length) {
		const conjunctDistance = this.conjunctDistance;
		const minPitch = pitchSpace[0], maxPitch = pitchSpace[pitchSpace.length - 1];
		const midPitch = (minPitch + maxPitch) / 2;
		const notes = [];
		let currentLength = 0;
		let conjunctive = type === 'conjunct';
		let patterns, numCandidates, oversizeCandidates, candidate;
		let logStr = 'Melody: ';
		while (currentLength < length - 1) {
			if (type === 'mixed') {
				conjunctive = Math.random() < this.conjunctProbability;
			}

			patterns = conjunctive ? conjunctPatterns : disjunctPatterns;
			oversizeCandidates = [];
			candidate = undefined;

			if (conjunctive) {
				const dupCandidates = [], noDupCandidates = [];
				for (let pattern of patterns) {
					if (currentLength + pattern.length > length) {
						oversizeCandidates.push(pattern);
					} else {
						const distance = Math.abs(pattern[0] - lastPitch);
						if (distance === 0) {
							dupCandidates.push(pattern);
						} else if (distance <= conjunctDistance) {
							noDupCandidates.push(pattern);
						}
					}
				}
				numCandidates = noDupCandidates.length;
				if (numCandidates > 0) {
					candidate = noDupCandidates[Math.trunc(Math.random() * numCandidates)];
				}
				if (candidate === undefined) {
					numCandidates = dupCandidates.length;
					if (numCandidates > 0) {
						candidate = dupCandidates[Math.trunc(Math.random() * numCandidates)];
					}
				}
			} else {
				const distance = cdfLookup(this.disjunctIntervals);
				let startPitch;
				if (lastPitch > midPitch) {
					startPitch = lastPitch - distance;
				} else {
					startPitch = lastPitch + distance;
				}
				if (startPitch < minPitch) {
					startPitch = minPitch;
				} else if (startPitch > maxPitch) {
					startPitch = maxPitch;
				}
				const candidates = [];
				for (let pattern of patterns) {
					if (pattern[0] === startPitch) {
						if (currentLength + pattern.length > length) {
							oversizeCandidates.push(pattern);
						} else {
							candidates.push(pattern);
						}
					}
				}
				numCandidates = candidates.length;
				if (numCandidates > 0) {
					candidate = candidates[Math.trunc(Math.random() * numCandidates)];
				}
			}

			if (candidate === undefined) {
				numCandidates = oversizeCandidates.length;
				if (numCandidates > 0) {
					candidate = oversizeCandidates[Math.trunc(Math.random() * numCandidates)];
				} else {
					numCandidates = patterns.length;
					candidate = patterns[Math.trunc(Math.random() * numCandidates)];
				}
			}
			notes.splice(currentLength, 0, ...candidate);
			currentLength += candidate.length;
			lastPitch = candidate[candidate.length - 1];
			logStr += candidate + '|';
		}
		if (currentLength < length) {
			let finalPitch = 2 * notes[currentLength - 1] - notes[currentLength - 2];
			if (finalPitch < minPitch) {
				finalPitch = minPitch;
			} else if (finalPitch > maxPitch) {
				finalPitch = maxPitch;
			}
			if (finalPitch - notes[currentLength - 1] === 0 && finalPitch !== minPitch && finalPitch !== maxPitch) {
				finalPitch--;
			}
			notes.push(finalPitch);
			logStr += finalPitch;
		} else {
			notes.splice(length, currentLength - length);
		}
		console.log(logStr);
		return notes;
	}

	generateSongStructure() {
		let superStructure, superLength
		const isVariations = Math.random() < this.variationsProbability;
		if (isVariations) {
			superLength = Math.trunc(Math.random() * 3 + 2);
			superStructure = new Array(superLength);
			superStructure.fill(0);
		} else {
			do {
				superStructure = cdfLookup(this.structureDist);
				superLength = superStructure.length;
			} while (superStructure.length === 1);
		}

		const rondo = Math.random() < this.rondoProbability;
		const inner = cdfLookup(this.structureDist);
		const structure = [];
		const variants = [];
		const structures = [];
		let offset = rondo ? 1 : 0;
		const currentVariants = rondo ? [-1] : [];
		console.log('Super structure: ' + superStructure);

		for (let i = 0; i < superLength; i++) {
			if (rondo) {
				structure.push(0);
				currentVariants[0]++;
				variants.push(currentVariants[0]);
			}
			const superValue = superStructure[i];
			let form = structures[superValue];
			if (form === undefined) {
				form = inner.slice();
				for (let j = 0; j < form.length; j++) {
					form[j] += offset;
				}
				offset = Math.max(...form) + 1;
				if (Math.random() < this.repeatProbability) {
					const withRepeats = [];
					for (let value of form) {
						withRepeats.push(value);
						withRepeats.push(value);
					}
					form = withRepeats;
				}
				structures[superValue] = form;
				console.log(superValue + ' -> ' + form);
			}
			structure.splice(structure.length, 0, ...form);
			// TODO implement variation at the super structure level
			for (let value of form) {
				if (currentVariants[value] === undefined) {
					currentVariants[value] = 0;
				} else if (Math.random() < this.variationProbability) {
					currentVariants[value]++;
				}
				variants.push(currentVariants[value]);
			}
		}
		if (rondo) {
			structure.push(0);
			currentVariants[0]++;
			variants.push(currentVariants[0]);
		} else {
			const length = structure.length;
			const lastValue = structure[length - 1];
			if (inner.length > 1 ||
				(lastValue === structure[length - 2] && variants[length - 1] === variants[length - 2]) ||
				structure.length < 3
			) {
				// Add a more final ending
				structure.push(lastValue);
				currentVariants[lastValue]++;
				variants.push(currentVariants[lastValue]);
			}
		}

		console.log('Structure:  ' + structure);
		console.log('Variations: ' + variants);
	}

	generateOutput(noteValues, melody, length) {
		const phrase = new Sequencer.Phrase('Generated', length * 2);
		const numBlocks = noteValues.length;
		let rowNum = 0;
		let melodyIndex = 0;
		while (rowNum < length) {
			for (let i = 0; i < numBlocks; i++) {
				const beatGroup = noteValues[i];
				for (let j = 0; j < beatGroup.length; j++) {
					const beatLength = beatGroup[j];
					if (beatLength > 0) {
						const parameterMap = new Map();
						const note = melody[melodyIndex];
						const duration = beatLength * 2 * this.articulation;
						const velocity = j === 0 ? 127 : this.offbeatVelocity;
						parameterMap.set(Synth.Param.NOTES, new Synth.Change(Synth.ChangeType.SET, [note]));
						parameterMap.set(Synth.Param.GATE, new Synth.Change(Synth.ChangeType.SET, Synth.Gate.TRIGGER));
						parameterMap.set(Synth.Param.DURATION, new Synth.Change(Synth.ChangeType.SET, duration));
						parameterMap.set(Synth.Param.VELOCITY, new Synth.Change(Synth.ChangeType.SET, velocity));
						phrase.rows[rowNum] = parameterMap;
						melodyIndex++;
					}
					rowNum += Math.abs(beatLength) * 2;
				}
			}
		}
		return phrase;
	}

	generatePhrase(timeSignatureType) {
		const timeSignature = this.generateTimeSignature(timeSignatureType);
		console.log('Time signature: ' + timeSignature.length + '/' + String(8 / timeSignature.beatLength));
		if (timeSignature.type !== TimeSignatureType.SIMPLE) {
			console.log('Beat: ' + timeSignature.groupings);
		}

		const numBars = Math.max(Math.round(16 / timeSignature.length), 2);
		let noteValues = this.generateRhythm(timeSignature, RhythmType.FIRST_BAR);
		for (let i = 1; i < numBars; i++) {
			noteValues = noteValues.concat(this.generateRhythm(timeSignature, RhythmType.UNCONSTRAINED));
		}

		const numBlocks = noteValues.length;
		let numNotes = 0;
		for (let i = 0; i < numBlocks; i++) {
			const beatGroup = noteValues[i];
			for (let j = 0; j < beatGroup.length; j++) {
				const beatLength = beatGroup[j];
				if (beatLength > 0) {
					numNotes++;
				}
			}
		}

		const scale = this.generateScale()
		const rootNote = this.minNote + Math.trunc((this.maxNote - this.minNote + 1) / 2 - 6 + Math.random() * 12);
		const pitchSpace = generatePitchSpace(scale, rootNote, this.minNote, this.maxNote);

		const conjunctPatterns = [];
		let numContours = 0;
		while (numContours < this.numConjunctContours) {
			const contour = this.generateContour(true);
			const newPatterns = SongGenerator.putContourInPitchSpace(contour, pitchSpace);
			if (newPatterns.length > 0) {
				conjunctPatterns.splice(conjunctPatterns.length, 0, ...newPatterns);
				numContours++;
			}
		}

		const disjunctPatterns = [];
		numContours = 0;
		while (numContours < this.numDisjunctContours) {
			const contour = this.generateContour(false);
			const newPatterns = SongGenerator.putContourInPitchSpace(contour, pitchSpace);
			if (newPatterns.length > 0) {
				disjunctPatterns.splice(disjunctPatterns.length, 0, ...newPatterns);
				numContours++;
			}
		}

		const melody = this.generateMelody(pitchSpace, conjunctPatterns, disjunctPatterns, 'mixed', rootNote, numNotes);

		const phrase = this.generateOutput(noteValues, melody, timeSignature.length * numBars * 2);
		return phrase;
	}

}
