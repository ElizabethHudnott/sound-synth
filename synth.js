'use strict';
const audioContext = new AudioContext({sampleRate: 96000});
audioContext.audioWorklet.addModule('audioworkletprocessors.js');

const LOWEST_LEVEL = 1 / 65535;
const SHORTEST_TIME = 1 / 96000;
const LOG_BASE = 10**(Math.log10(1/65535) / -100);

const Parameter = Object.freeze({
	ATTACK: 0,		// in milliseconds
	DECAY: 1,		// in milliseconds
	RELEASE: 2,		// in milliseconds
	DURATION: 3,	// in milliseconds
	SUSTAIN: 4,		// percentage
	GATE: 5,		// CLOSED, OPEN or TRIGGER
	WAVEFORM: 6,	// 'sine', 'square', 'sawtooth' or 'triangle'
	FREQUENCY: 7,	// in hertz
	NOTE: 8,		// MIDI note number
	DETUNE: 9,		// in cents
	VOLUME: 10,		// percentage
	PANNED: 11,		// 0 or 1
	VOICE: 12,		// Combinations of Voice enum values
	PULSE_WIDTH: 14,// 0 to 1
});

const ChangeType = Object.freeze({
	SET: 'setValueAtTime',
	DELTA: 'delta',
	LINEAR: 'linearRampToValueAtTime',
	EXPONENTIAL: 'exponentialRampToValueAtTime',
});

class Change {
	constructor(type, value) {
		this.type = type;
		this.value = value;
	}
}

const Gate = Object.freeze({
	CLOSED: 0,
	OPEN: 1,
	TRIGGER: 2,
});

const Voice = Object.freeze({
	OSCILLATOR: 1,
	PULSE: 2,
	NOISE: 4,
	SAMPLE: 8
});

const noteFrequencies = [];

for (let i = 0; i <= 127; i++) {
	noteFrequencies[i] = 2**((i - 69) / 12) * 440;
}

class MultiplierProcessor extends AudioWorkletNode {
  constructor(context, numInputs) {
    super(audioContext, 'multiplier-processor', {numberOfInputs: numInputs});
  }
}

class SynthChannel {
	constructor(pannedLeft) {
		this.parameters = [
			2,		// attack (ms)
			50,		//decay (ms)
			300,	// release (ms)
			200,	// duration (ms)
			50,		// sustain (%)
			Gate.CLOSED, // gate
			'sine',	// waveform
			440,	// frequency
			69,		// MIDI note number
			0,		// detune
			100,	//	volume
			0,		// pan
			Voice.OSCILLATOR,
			0.5		// pulse width
		];
		this.sustain = this.parameters[Parameter.SUSTAIN] / 100;
		this.calcEnvelope(3)

		const multiplexer = new MultiplierProcessor(audioContext, 3);
		this.multiplexer = multiplexer;

		const oscillator = audioContext.createOscillator();
		oscillator.start();
		this.oscillator = oscillator;
		oscillator.connect(multiplexer, 0, 0);

		const pwm = new AudioWorkletNode(audioContext, 'pulse-width-modulation-processor');
		this.pwm = pwm;
		oscillator.connect(pwm);
		pwm.connect(multiplexer, 0, 1);

		const noise = new AudioWorkletNode(audioContext, 'noise-generation-processor');
		this.noise = noise;
		oscillator.connect(noise);
		noise.connect(multiplexer,0, 2);

		const envelope = audioContext.createGain();
		this.envelope = envelope;
		envelope.gain.value = 0;
		multiplexer.connect(envelope);

		const panner = audioContext.createStereoPanner();
		this.panner = panner;
		this.panValue = pannedLeft? -1 : 1;
		envelope.connect(panner);

		const volume = audioContext.createGain();
		this.volume = volume;
		panner.connect(volume);

		volume.connect(audioContext.destination);
	}

	calcEnvelope(dirty) {
		const params = this.parameters;

		if (dirty & 1) {
			const endAttack = params[Parameter.ATTACK];
			const endDecay = endAttack + params[Parameter.DECAY];
			this.endAttack = endAttack / 1000;
			this.endDecay = endDecay / 1000;
		}
		if (dirty & 2) {
			const duration = params[Parameter.DURATION];
			const release = params[Parameter.RELEASE];
			const endRelease = duration + release;
			this.release = release / 1000;
			this.beginRelease = duration / 1000;
			this.endRelease = endRelease / 1000;
		}
	}

	gate(start) {
		const gain = this.envelope.gain;
		gain.cancelAndHoldAtTime(start);
		const state = this.parameters[Parameter.GATE];
		let endTime;

		switch (state) {
		case Gate.OPEN:
			gain.linearRampToValueAtTime(1, start + this.endAttack);
			gain.linearRampToValueAtTime(this.sustain, start + this.endDecay);
			break;
		case Gate.CLOSED:
			endTime = start + this.release;
			gain.exponentialRampToValueAtTime(LOWEST_LEVEL, endTime);
			gain.setValueAtTime(0, endTime + SHORTEST_TIME);
			break;
		case Gate.TRIGGER:
			gain.linearRampToValueAtTime(1, start + this.endAttack);
			gain.linearRampToValueAtTime(this.sustain, start + this.endDecay);
			const beginRelease = start + this.beginRelease;
			gain.cancelAndHoldAtTime(beginRelease);
			gain.setValueAtTime(this.sustain, beginRelease);
			endTime = start + this.endRelease;
			gain.exponentialRampToValueAtTime(LOWEST_LEVEL, endTime);
			gain.setValueAtTime(0, endTime + SHORTEST_TIME);
		}
	}

	setFrequency(changeType, frequency, when) {
		let param = this.oscillator.frequency;
		param.cancelAndHoldAtTime(when);
		param[changeType](frequency, when);
	}

	setDetune(changeType, cents, when) {
		let param = this.oscillator.detune;
		param.cancelAndHoldAtTime(when);
		param[changeType](cents, when);
	}

	setParameters(parameterMap, time, now) {
		const me = this;
		const gate = parameterMap.get(Parameter.GATE);
		let dirtyEnvelope = 0;
		let timeDifference;

		for (let [paramNumber, change] of parameterMap) {
			let changeType = change.type;
			let value = change.value;
			let param;
			if (changeType === ChangeType.DELTA) {
				changeType = ChangeType.SET;
				value += this.parameters[paramNumber];
			}
			this.parameters[paramNumber] = value;

			if (paramNumber <= Parameter.DURATION) {
				if (paramNumber < Parameter.RELEASE) {
					dirtyEnvelope = dirtyEnvelope | 1;
				} else {
					dirtyEnvelope = dirtyEnvelope | 2;
				}
				continue;
			}

			switch (paramNumber) {
			case Parameter.SUSTAIN:
				this.sustain = value / 100;
				break;

			case Parameter.WAVEFORM:
				timeDifference = Math.round((time - now) * 1000);
				if (timeDifference > 0) {
					setTimeout(function () {
						me.oscillator.type = value;
					}, timeDifference);
				} else {
					this.oscillator.type = value;
				}
				break;

			case Parameter.FREQUENCY:
				this.setFrequency(changeType, value, time);
				break;

			case Parameter.NOTE:
				const frequency = noteFrequencies[value];
				this.setFrequency(changeType, frequency, time);
				this.parameters[Parameter.FREQUENCY] = frequency;
				break;

			case Parameter.DETUNE:
				this.setDetune(changeType, value, time);
				break;

			case Parameter.VOLUME:
				param = this.volume.gain;
				param.cancelAndHoldAtTime(time);
				param[changeType](LOG_BASE**-(100 - value), time);
				break;

			case Parameter.PANNED:
				value = Math.trunc(value) % 2;
				param = this.panner.pan;
				param.cancelAndHoldAtTime(time);
				param.setValueAtTime(value === 0? 0 : this.panValue, time);
				this.parameters[Parameter.PANNED] = value;
				break;

			case Parameter.VOICE:
				param = this.multiplexer.parameters.get('mask');
				param.cancelAndHoldAtTime(time);
				param.setValueAtTime(value, time);
				break;

			case Parameter.PULSE_WIDTH:
				param = this.pwm.parameters.get('width');
				param.cancelAndHoldAtTime(time);
				param[changeType](value, time);
				break;

			}
		}
		if (dirtyEnvelope) {
			this.calcEnvelope(dirtyEnvelope);
		}
		if (gate !== undefined) {
			this.gate(time);
		}
	}

}

let channel1;

function initialize() {
	audioContext.resume();
	channel1 = new SynthChannel(true);
	document.getElementById('intro').style.display = 'none';
	document.getElementById('controls').style.display = 'block';
}

function set(parameterNumber, value) {
	const parameterMap = new Map();
	parameterMap.set(parameterNumber, new Change(ChangeType.SET, value));
	const time = audioContext.currentTime;
	channel1.setParameters(parameterMap, time, time);
}
