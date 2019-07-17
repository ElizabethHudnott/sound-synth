(function(global) {
'use strict';

class PeriodicWaveMachine extends Machine {
	static Param = Synth.enumFromArray([
		'SIN',	// Sine coefficients
		'COS',	// Cosine coefficients
	]);

	constructor(audioContext, targetOscillator) {
		super([
			[1],
			[]
		]);

		this.audioContext = audioContext;
		this.target = targetOscillator;
		this.inputs = [];
		this.outputs = [];
	}

	setParameters(changes, time, callbacks) {
		const Parameter = PeriodicWaveMachine.Param; // Parameter names
		const parameters = this.parameters; // Parameter values
		let dirtyCoefficients = false;

		for (let change of changes) {
			if (change.machine !== this) {
				continue;
			}

			switch (change.parameterNumber) {
			case Parameter.SIN:
			case Parameter.COS:
				dirtyCoefficients = true;
				break;

			case undefined:
				console.error(this.constructor.name + ': An unknown parameter name was used.');
				break;
			}
		}

		if (dirtyCoefficients) {
			const sin = parameters[Parameter.SIN].slice();
			sin.unshift(0);
			const cos = parameters[Parameter.COS].slice();
			cos.unshift(0);
			const sinLength = sin.length;
			const cosLength = cos.length;
			if (sinLength < cosLength) {
				for (let i = sinLength; i < cosLength; i++) {
					sin[i] = 0;
				}
			} else if (cosLength < sinLength) {
				for (let i = cosLength; i < sinLength; i++) {
					cos[i] = 0;
				}
			}
			const wave = this.audioContext.createPeriodicWave(cos, sin);
			const target = this.target;
			callbacks.push(function () {
				target.setPeriodicWave(wave);
			});
		}
	}

}

global.Machines.PeriodicWave = PeriodicWaveMachine;

})(window);
