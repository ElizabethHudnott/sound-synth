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

const scales = new Map();
scales.set('major', [2, 2, 1, 2, 2, 2, 1]);
scales.set('minor', [2, 1, 2, 2, 1, 2, 2]);

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

class PhraseGenerator {
	constructor() {
		// Approximate length in quavers.
		this.lengthDist = uniformCDF(3, 12);

		/* Frequency distribution of duplets and triplets for complex time signatures
		 * (and maybe quintuplets or septuplets).
		 */
		this.subdivisionDist = makeCDF(new Map([[2, 2], [3, 1]]));

		/* Distribution of eighth notes (1), half notes (4), etc. */
		this.beatDist = makeCDF(new Map([
			[1, 12], [2, 6], [3, 4], [4, 3], [6, 2], [8, 1.5],
		]));

		// Distribution of rests, assuming a 16 beat length
		this.restTimeDist = uniformCDF(0, 6);

		this.minNote = 47; // B2
		this.maxNote = 70; // A#4
		this.scaleDist = [[0.5, 1], ['major', 'minor']];

		this.contourDist = makeCDF(new Map([
			['=', 10], ['+', 30], ['-', 30], ['+-', 15], ['-+', 15],
		]));
		this.contourLength = uniformCDF(2, 5);
		this.conjunctIntervals = makeCDF(new Map([
			[1, 18], [2, 64], [3, 18],
		]));
		this.disjunctIntervals = makeCDF(new Map([
			[3, 3], [4, 3], [5, 3], [6, 3], [8, 1],
		]));
		this.wobbleContour = 0.2;
	}

	generateTimeSignature(type) {
		let length = cdfLookup(this.lengthDist);
		let beatLength, lengths;
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
			beatLength = 3;
			length = (Math.trunc(length / 3) + 1) * 3;
			lengths = new Array(length / 3);
			lengths.fill(3);
			break;

		case TimeSignatureType.COMPLEX:
			beatLength = 1;
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

	generateRhythm(timeSignature, isFirstBar) {
		const timeSignatureType = timeSignature.type;
		const length = timeSignature.length;
		const mainBeatLength = timeSignature.beatLength;
		const lengths = timeSignature.groupings.slice();
		let numBlocks = lengths.length;
		const noteValues = [];

		if (timeSignatureType === TimeSignatureType.SIMPLE) {
			console.log('Beat length: ' + mainBeatLength);
			let i = 0, offset = 0, owed = 0;
			let beatLength;
			while (i < numBlocks) {
				if (owed > numBlocks - i) {
					owed = 0;
				}
				if (owed === 0) {
					beatLength = cdfLookup(this.beatDist), numBlocks - i, numBlocks - 1;
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

		} else if (numBlocks === 1) {

			const beats = new Array(lengths[0]);
			beats.fill(1);
			noteValues[0] = beats;

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
		while (restsToAllocate > 0 && attempts < 100) {
			const index = Math.trunc(Math.random() * length);
			let currentIndex = 0;
			for (let i = 0; i < numBlocks; i++) {
				const blockLength = lengths[i];
				if (index < currentIndex + blockLength) {
					let indexWithinBlock = index - currentIndex;
					const beats = noteValues[i];
					const beatLength = beats[indexWithinBlock];
					if ((indexWithinBlock !== 0 || i !== 0 || !isFirstBar) && beatLength > 0) {
						beats[indexWithinBlock] = -beatLength;
						restsToAllocate -= beatLength;
					}
					break;
				}
				currentIndex += blockLength;
			}
			attempts++;
		}
		for (let i = 0; i < numBlocks && restsToAllocate < 0; i++) {
			const beatGroup = noteValues[i];
			for (let j = 0; j < beatGroup.length && restsToAllocate < 0; j++) {
				const beat = beatGroup[j];
				if (beat < 0 && -beat <= -restsToAllocate) {
					beatGroup[j] = -beat;
					restsToAllocate += -beat;
				}
			}
		}

		console.log('Blocks: ' + lengths);
		console.log('Rhythm: ' + noteValues.flat());

		return noteValues;
	}

	generateContourLength(conjunctive) {
		if (conjunctive) {
			return cdfLookup(this.contourLength);
		} else {
			// Two disjunctive contours take the place of one conjunctive contour
			return Math.max(Math.ceil(cdfLookup(this.contourLength) / 2), 2);
		}
	}

	generateContour(conjunctive) {
		const type = cdfLookup(this.contourDist);
		let length = this.generateContourLength(conjunctive);
		const intervalDist = conjunctive ? this.conjunctIntervals : this.disjunctIntervals;
		const intervals = [0];
		let position = 0;
		switch (type) {
		case '=':
			if (conjunctive) {
				for (let i = 1; i < length; i++) {
					if (Math.random() < this.wobbleContour) {
						const sign = Math.random() < 0.5 ? -1 : 1;
						intervals.push(position + 1);
						if (i === length - 1) {
							break;
						}
						i++;
					}
					intervals.push(position);
				}
			} else {
				for (let i = 1; i < length; i++) {
					const sign = Math.random() < 0.5 ? -1 : 1;
					const interval = cdfLookup(intervalDist) - 1;
					position += sign * interval;
					intervals.push(position);
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

		case '+-':
			for (let i = 1; i < length; i++) {
				const interval = cdfLookup(intervalDist) - 1;
				position += interval;
				intervals.push(position);
			}
			length = this.generateContourLength(conjunctive);
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
			length = this.generateContourLength(conjunctive);
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

	}

	generateOutput(noteValues, length) {
		const phrase = new Sequencer.Phrase('Generated', length * 2);
		const numBlocks = noteValues.length;
		let rowNum = 0;
		for (let i = 0; i < numBlocks; i++) {
			const beatGroup = noteValues[i];
			for (let j = 0; j < beatGroup.length; j++) {
				const beatLength = beatGroup[j];
				if (beatLength > 0) {
					const parameterMap = new Map();
					parameterMap.set(Synth.Param.GATE, new Synth.Change(Synth.ChangeType.SET, Synth.Gate.TRIGGER));
					parameterMap.set(Synth.Param.DURATION, new Synth.Change(Synth.ChangeType.SET, beatLength * 1.5));
					phrase.rows[rowNum] = parameterMap;
				}
				rowNum += Math.abs(beatLength) * 2;
			}
		}
		const lastParams = new Map();
		let numLoops = Math.round(64 / length);
		if (numLoops < 2) {
			numLoops = 2;
		}
		lastParams.set(Synth.Param.LOOP, new Synth.Change(Synth.ChangeType.SET, numLoops));
		phrase.rows[length * 2 - 1] = lastParams;
		return phrase;
	}

	generatePhrase(timeSignatureType) {
		const timeSignature = this.generateTimeSignature(timeSignatureType);
		const noteValues = this.generateRhythm(timeSignature, true);

		const scaleType = cdfLookup(this.scaleDist);
		const rootNote = this.minNote + Math.trunc((this.maxNote - this.minNote + 1) / 2 - 6 + Math.random() * 12);
		const pitchSpace = generatePitchSpace(scales.get(scaleType), rootNote, this.minNote, this.maxNote);

		const phrase = this.generateOutput(noteValues, timeSignature.length);
		return phrase;
	}

}
