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
	i = 0;
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

const TimeSignatureType = Object.freeze({
	SIMPLE: 1,
	COMPOUND: 3,
	ANY: 0,
});

class RhythmGenerator {
	constructor() {
		// Approximate length in quavers.
		this.lengthDist = uniformCDF(2, 12);

		/* Frequency distribution of duplets and triplets for complex time signatures
		 * (and maybe quintuplets or septuplets).
		 */
		this.subdivisionDist = makeCDF(new Map([[2, 2], [3, 1]]));

		/* Distribution of eighth notes (1), half notes (4), etc. */
		this.beatDist = makeCDF(new Map([[1, 4], [2, 2], [3, 1.5], [4, 1]]));

		// Distribution of rests, assuming a 16 beat length
		this.restTimeDist = uniformCDF(0, 8);
	}

	generate(timeSignatureType, isFirstBar) {
		// 1 = quavers as the basic note (x/8 time), 2 = crotchet (x/4 time), etc.
		const mainBeatLength = 2 ** Math.trunc(Math.random() * 3);
		let length = cdfLookup(this.lengthDist);
		let lengths;
		switch (timeSignatureType) {
		case TimeSignatureType.SIMPLE:
			length = Math.max(Math.round(length / mainBeatLength), 2) * mainBeatLength;
			lengths = new Array(length);
			lengths.fill(1);
			break;

		case TimeSignatureType.COMPOUND:
			length = Math.round(Math.max(length, 3) / 3) * 3;
			lengths = new Array(length / 3);
			lengths.fill(3);
			break;

		case TimeSignatureType.ANY:
			lengths = [];
			let lengthSoFar = 0;
			while (lengthSoFar < length - 1) {
				const subdivision = cdfLookup(this.subdivisionDist);
				lengths.push(subdivision);
				lengthSoFar += subdivision;
			}
			length = lengthSoFar;
			break;
		}

		let numBlocks = lengths.length;
		let noteValues = [];
		if (timeSignatureType === TimeSignatureType.SIMPLE) {
			console.log('Beat length: ' + mainBeatLength);
			let i = 0, offset = 0;
			let beatLength, owed;
			while (i < numBlocks) {
				if (owed === undefined) {
					beatLength = Math.min(cdfLookup(this.beatDist), numBlocks - i, numBlocks - 1);
				} else {
					beatLength = owed;
				}
				if (offset + beatLength > mainBeatLength && offset !== 0) {
					if (owed === undefined) {
						owed = beatLength;
					}
					do {
						beatLength = Math.min(cdfLookup(this.beatDist), numBlocks - i, numBlocks - 1);
					} while (offset + beatLength > mainBeatLength && offset !== 0)
				}
				if (beatLength === owed) {
					owed = undefined;
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
			let i = 0, beatLength, owed;
			while (i < numBlocks) {
				const subdivision = lengths[i];
				if (owed === undefined) {
					beatLength = cdfLookup(this.beatDist);
				} else {
					beatLength = owed;
				}
				while (beatLength === 3 ||
					(beatLength === 4 && (numBlocks === 2 || subdivision !== lengths[i + 1]))
				) {
					if (beatLength === 4) {
						owed = 4;
					}
					beatLength = cdfLookup(this.beatDist);
				}
				if (beatLength === owed) {
					owed = undefined;
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

		const phrase = new Sequencer.Phrase('Generated', length * 2);
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

}
