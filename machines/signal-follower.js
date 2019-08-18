(function(global) {
'use strict';

class SignalFollowerMachine extends Machine {
	static Param = Synth.enumFromArray([
		'ATTACK',		// Attack in milliseconds
		'RELEASE',		// Release in milliseconds
		'SENSITIVITY',	// Lowest frequency to respond to in Hertz
	]);

	constructor(audioContext) {
		// Call the superclass constructor, passing it initial values for each of the
		// machine's parameters.
		super([
			0,
			0,
			100,
		]);
		this.audioContext = audioContext;

		const rectifier = audioContext.createWaveShaper();
		const arr = new Float32Array(257);
		for (let i = 0; i < 257; i++) {
			const x = (i - 128) / 128;
			arr[i] = x * x;
		}
		rectifier.curve = arr;

		const convolver = audioContext.createConvolver();
		this.convolver = convolver;
		this.calcImpulse();
		rectifier.connect(convolver);

		const gain = audioContext.createGain();
		gain.gain.value = 2;
		convolver.connect(gain);

		const offset = audioContext.createConstantSource();
		offset.offset.value = -1;
		offset.start();

		// Connecting a node to this machine will connect that node to each of these
		// internal destinations.
		this.inputs = [rectifier];

		// Connecting this machine to an external destination will connect each of these
		// internal nodes to the external destination.
		this.outputs = [gain, offset];
	}

	calcImpulse() {
		const Parameter = SignalFollowerMachine.Param;
		const parameters = this.parameters;
		const sampleRate = this.audioContext.sampleRate;
		const attackLength = Math.round(sampleRate * parameters[Parameter.ATTACK] / 1000);
		const mainLength = Math.ceil(sampleRate / parameters[Parameter.SENSITIVITY]);
		const releaseLength = Math.round(sampleRate * parameters[Parameter.RELEASE] / 1000);
		const endMain = attackLength + mainLength;
		const totalLength = endMain + releaseLength;
		const attackGradient = 2 / attackLength;
		const releaseGradient = 2 / releaseLength;
		const buffer = this.audioContext.createBuffer(1, totalLength, sampleRate);
		const data = buffer.getChannelData(0);
		for (let i = 0; i < attackLength; i++) {
			data[i] = i * attackGradient - 1;
		}
		data.fill(1, attackLength, endMain);
		for (let i = 0; i < releaseLength; i++) {
			data[endMain + i] = 1 - i * releaseGradient;
		}
		this.convolver.buffer = buffer;
	}

	setParameters(changes, time, callbacks) {
		const Parameter = SignalFollowerMachine.Param; // Parameter names
		const me = this; // For referring to inside callbacks.
		let dirtyImpulse = false;

		for (let change of changes) {
			if (change.machine !== this) {
				continue;
			}

			const parameterNumber = change.parameterNumber;

			if (parameterNumber >= 0 && parameterNumber <= Parameter.SENSITIVITY) {
				dirtyImpulse = true;
			} else {
				console.error(this.constructor.name + ': An unknown parameter name was used.');
				break;
			}
		}
		if (dirtyImpulse) {
			callbacks.push(function () {
				me.calcImpulse();
			});
		}
	}

}

global.Machines.SignalFollower = SignalFollowerMachine;

})(window);
