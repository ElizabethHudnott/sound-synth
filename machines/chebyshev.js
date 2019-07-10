(function(global) {
'use strict';

const arrayLength = 2520;

const factors = [
	105, 90, 84, 72, 70, 63, 60, 56, 45, 42, 40, 36, 35, 30, 28, 24, 21, 20, 18, 15, 14,
	12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1
];

class ChebyshevMachine extends Machine {
	static get numberOfPolynomials() {
		return 10;
	}

	static Param = Synth.enumFromArray([
		'HARMONIC_1',	// Weighting of T1(x)
		'HARMONIC_2',	// Weighting of T2(x)
		'HARMONIC_3',	// Weighting of T3(x)
		'HARMONIC_4',	// Weighting of T4(x)
		'HARMONIC_5',	// Weighting of T5(x)
		'HARMONIC_6',	// Weighting of T6(x)
		'HARMONIC_7',	// Weighting of T7(x)
		'HARMONIC_8',	// Weighting of T8(x)
		'HARMONIC_9',	// Weighting of T9(x)
		'HARMONIC_10',	// Weighting of T10(x)
		'ODD',			// Odd harmonics are multiplied by this amount
		'EVEN',			// Even harmonics are multiplied by this amount
		'SLOPE',		// Higher harmonics are reduced when this parameter is less than one.
		'DRIVE',		// Non-negative number. Zero is no distortion.
		'OFFSET',		// Amount of offset to add as a proportion of the amount of drive.
		'ACCURACY',		// An integer from 0 (least accurate) to 31 (most accurate)
	]);

	constructor(audioContext) {
		// Call the superclass constructor, passing it initial values for each of the
		// machine's parameters.
		super([
			1,	// Amount of 1st harmonic. Default to no distortion.
			0,	// Amount of 2nd harmonic. Default to no distortion.
			0,	// Amount of 3rd harmonic. Default to no distortion.
			0,	// Amount of 4th harmonic. Default to no distortion.
			0,	// Amount of 5th harmonic. Default to no distortion.
			0,	// Amount of 6th harmonic. Default to no distortion.
			0,	// Amount of 7th harmonic. Default to no distortion.
			0,	// Amount of 8th harmonic. Default to no distortion.
			0,	// Amount of 9th harmonic. Default to no distortion.
			0,	// Amount of 10th harmonic. Default to no distortion.
			1,	// Don't modify odd harmonic weightings.
			1,	// Don't modify even harmonic weightings.
			1,	// No slope. Don't modify harmonic weightings.
			0,	// No drive
			0,	// No offset
			23,	// Default accuracy (280 points)
		]);

		// Here we create the machine's internal components using the Web Audio API.
		// In this case we just need a single WaveShaperNode.
		const shaper = audioContext.createWaveShaper();
		this.shaper = shaper;

		// Connecting a node to this machine will connect that node to each of these
		// internal destinations.
		this.inputs = [shaper];

		// Connecting this machine to an external destination will connect each of these
		// internal nodes to the external destination.
		this.outputs = [shaper];
	}

	setParameters(changes, time, callbacks) {
		const Parameter = ChebyshevMachine.Param;	// Parameter names
		const parameters = this.parameters;			// Parameter values
		const me = this; // For referring to inside callbacks.
		let dirtyCurve = false;

		for (let change of changes) {
			if (change.machine !== this) {
				continue;
			}

			const parameterNumber = change.parameterNumber;

			if (parameterNumber === Parameter.ACCURACY) {
				// Ensure this parameter has an integer value between in the right range
				let value = Math.round(parameters[parameterNumber]);
				if (value < 0) {
					value = 0;
				} else if (value >= factors.length) {
					value = factors.length - 1;
				}
				parameters[Parameter.ACCURACY] = value;
			}

			if (parameterNumber >= 0 && parameterNumber <= Parameter.ACCURACY) {
				dirtyCurve = true;
			} else {
				console.error(this.constructor.name + ': An unknown parameter name was used.');
			}
		}

		if (dirtyCurve) {
			// Compute the weightings
			const numCoefficients = ChebyshevMachine.numberOfPolynomials;
			const coefficients = new Array(numCoefficients);
			const odd = parameters[Parameter.ODD];
			for (let i = 0; i < numCoefficients; i += 2) {
				coefficients[i] = parameters[i] * odd;
			}

			const even = parameters[Parameter.EVEN];
			for (let i = 1; i < numCoefficients; i += 2) {
				coefficients[i] = parameters[i] * even;
			}

			const slope = parameters[Parameter.SLOPE];
			if (slope !== 0) {
				const m = (slope - 1) / (numCoefficients - 1);
				for (let i = 0; i < numCoefficients; i++) {
					coefficients[i] = (m * i + 1) * coefficients[i];
				}
			}

			// Compute the weighted sum of the polynomials
			const step = factors[parameters[Parameter.ACCURACY]];
			const length = arrayLength / step;
			const curve = new Float32Array(length);
			for (let i = 0; i < length; i++) {
				const index = i * step;
				let value = 0;
				for (let j = 0; j < numCoefficients; j++) {
					value += coefficients[j] * chebyshevPolynomials[j][index];
				}
				curve[i] = value;
			}

			// Normalize the curve and apply drive
			let min = curve[0];
			let max = min;
			for (let i = 1; i < length; i++) {
				const value = curve[i];
				if (value < min) {
					min = value;
				} else if (value > max) {
					max = value;
				}
			}
			const originalOffset = (min + max) / 2;
			const amplitude = (max - min) / 2;
			const drive = 1 + parameters[Parameter.DRIVE];
			const offset = parameters[Parameter.OFFSET] * (drive - 1);
			for (let i = 0; i < length; i++) {
				let value = ((curve[i] - originalOffset) / amplitude) * drive + offset;
				if (value > 1) {
					value = 1;
				} else if (value < -1) {
					value = -1;
				}
				curve[i] = value;
			}

			callbacks.push(function () {
				me.shaper.curve = curve;
			});
		}
	}

}

const numPolynomials = ChebyshevMachine.numberOfPolynomials;
const chebyshevPolynomials = new Array(numPolynomials);
for (let i = 0; i < numPolynomials; i++) {
	chebyshevPolynomials[i] = new Float32Array(arrayLength);
}
for (let i = 0; i < arrayLength; i++) {
	const x = 2 * i / arrayLength - 1;
	chebyshevPolynomials[0][i] = x;
	chebyshevPolynomials[1][i] = 2 * x * x -1;
}
for (let j = 2; j < numPolynomials; j++) {
	for (let i = 0; i < arrayLength; i++) {
		const x = 2 * i / arrayLength - 1;
		chebyshevPolynomials[j][i] = 2 * x * chebyshevPolynomials[j - 1][i] - chebyshevPolynomials[j - 2][i];
	}
}


global.Machines.ChebyshevMachine = ChebyshevMachine;

})(window);
