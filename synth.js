'use strict';
const audioContext = new AudioContext({sampleRate: 96000});

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
	PAN: 11,		// -1 to 1
	VOICE: 12,		// Combinations for Voice enum
	MIX: 13,		// Relative volumes
	PULSE_WIDTH: 14,// 0 to 1
});

const ChangeType = Object.freeze({
	SET: 'setValueAtTime',
	DELTA: 'delta',
	LINEAR: 'linearRampToValueAtTime',
	EXPONENTIAL: 'exponentialRampToValueAtTime',
	HOLD: 'cancelAndHoldAtTime',
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

class PulseWidthModulator extends AudioWorkletNode {
  constructor(context) {
    super(context, 'pulse-width-modulation-processor');
  }
}

class NoiseGenerator extends AudioWorkletNode {
  constructor(context) {
    super(context, 'noise-generation-processor');
  }
}

audioContext.audioWorklet.addModule('audioworkletprocessors.js');

class SynthChannel {
	constructor() {
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
			[1, 1, 1], // relative proportions of the different sources
		];
		this.sustain = this.parameters[Parameter.SUSTAIN] / 100;
		this.calcEnvelope(3)

		const oscillator = audioContext.createOscillator();
		oscillator.start();
		this.oscillator = oscillator;
		const oscillatorGain = audioContext.createGain();
		oscillator.connect(oscillatorGain);

		const pwm = new AudioWorkletNode(audioContext, 'pulse-width-modulation-processor');
		this.pwm = pwm;
		oscillator.connect(pwm);
		const pwmGain = audioContext.createGain();
		pwmGain.gain.value = 0;
		pwm.connect(pwmGain);

		const noise = new AudioWorkletNode(audioContext, 'noise-generation-processor');
		this.noise = noise;
		oscillator.connect(noise);
		const noiseGain = audioContext.createGain();
		noiseGain.gain.value = 0;
		noise.connect(noiseGain);

		const envelope = audioContext.createGain();
		this.envelope = envelope;
		envelope.gain.value = 0;

		oscillatorGain.connect(envelope);
		pwmGain.connect(envelope);
		noiseGain.connect(envelope);
		this.gains = [oscillatorGain, pwmGain, noiseGain];

		const pan = audioContext.createStereoPanner();
		this.pan = pan;
		envelope.connect(pan);

		const volume = audioContext.createGain();
		this.volume = volume;
		pan.connect(volume);

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

	calcGains(changeType, when) {
		let voices = this.parameters[Parameter.VOICE];
		const gains = this.gains;
		for (let gain of gains) {
			gain.gain.cancelAndHoldAtTime(when);
		}
		if (changeType !== ChangeType.HOLD) {
			const mix = this.parameters[Parameter.MIX];
			let total = 0;
			for (let level of mix) {
				if ((voices & 1) == 1) {
					total += level;
				}
				voices = voices>>1;
			}
			const unit = total > 0? 1 / total : 0;
			voices = this.parameters[Parameter.VOICE];
			for (let i = 0; i < mix.length; i++) {
				if ((voices & 1) === 1) {
					gains[i].gain[changeType](unit * mix[i], when);
				} else {
					gains[i].gain[changeType](0, when);
				}
				voices = voices>>1;
			}
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
		if (changeType === ChangeType.HOLD) {
			this.oscillator.frequency.cancelAndHoldAtTime(when);
		} else {
			this.oscillator.frequency[changeType](frequency, when);
		}
	}

	setDetune(changeType, cents, when) {
		if (changeType === ChangeType.HOLD) {
			this.oscillator.detune.cancelAndHoldAtTime(when);
		} else {
			this.oscillator.detune[changeType](cents, when);
		}
	}

	setParameters(parameterMap, time, now) {
		const me = this;
		const gate = parameterMap.get(Parameter.GATE);
		let dirtyEnvelope = 0;
		let gainChangeType;
		let timeDifference;

		for (let [paramNumber, change] of parameterMap) {
			let changeType = change.type;
			let value = change.value;
			if (paramNumber === Parameter.MIX) {
				const mix = this.parameters[Parameter.MIX]
				if (changeType === ChangeType.DELTA) {
					changeType = ChangeType.SET;
					for (let i = 0; i < value.length; i++) {
						mix[i] = mix[i] + value[i];
					}
				} else {
					for (let i = 0; i < value.length; i++) {
						mix[i] = value[i];
					}
				}
			} else {
				if (changeType === ChangeType.DELTA) {
					changeType = ChangeType.SET;
					value += this.parameters[paramNumber];
				}
				if (changeType !== ChangeType.HOLD) {
					this.parameters[paramNumber] = value;
				}
			}

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
				if (changeType === ChangeType.HOLD) {
					this.volume.gain.cancelAndHoldAtTime(time);
				} else {
					this.volume.gain[changeType](LOG_BASE**-(100 - value), time);
				}
				break;

			case Parameter.PAN:
				if (changeType === ChangeType.HOLD) {
					this.pan.pan.cancelAndHoldAtTime(time);
				} else {
					this.pan.pan[changeType](value, time);
				}
				break;

			case Parameter.VOICE:
			case Parameter.MIX:
				gainChangeType = changeType;
				break;

			case Parameter.PULSE_WIDTH:
				if (changeType === ChangeType.HOLD) {
					this.pwm.parameters.get('width').cancelAndHoldAtTime(time);
				} else {
					this.pwm.parameters.get('width')[changeType](value, time);
				}
				break;

			}
		}
		if (gainChangeType !== undefined) {
			this.calcGains(gainChangeType, time);
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
	channel1 = new SynthChannel();
	document.getElementById('intro').style.display = 'none';
	document.getElementById('controls').style.display = 'block';
}

function set(parameterNumber, value) {
	const parameterMap = new Map();
	parameterMap.set(parameterNumber, new Change(ChangeType.SET, value));
	const time = audioContext.currentTime;
	channel1.setParameters(parameterMap, time, time);
}
