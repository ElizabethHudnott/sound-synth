'use strict';
const audioContext = new AudioContext({sampleRate: 96000});
audioContext.audioWorklet.addModule('audioworkletprocessors.js');

const LOWEST_LEVEL = 1 / 65535;
const SHORTEST_TIME = 1 / 96000;
const LOG_BASE = 2**(16 / 100);

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
	TREMOLO_SHAPE: 11, // 'sine', 'square', 'sawtooth' or 'triangle'
	TREMOLO_FREQUENCY: 12,	// in hertz
	TREMOLO_AMOUNT: 13,		// 0 to 100
	PANNED: 14,		// 0 or 1
	VOICE: 15,		// Combinations of Voice enum values
	MIX: 16,		// Relative volumes
	PULSE_WIDTH: 17,// 0 to 1
	FILTERED: 18,	// 0 or 1
	FILTER_TYPE: -1, // 'lowpass', 'highpass', 'bandpass', 'notch', 'allpass', 'lowshelf', 'highshelf' or 'peaking'
	FILTER_FREQUENCY: -2, // in hertz
	FILTER_Q: -3,	// 0.0001 to 1000
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

class Modulator {
	constructor(audioContext, carrier) {
		this.min = 1;
		this.max = 1;

		const oscillator = audioContext.createOscillator();
		this.oscillator = oscillator;
		oscillator.frequency.value = 5;
		oscillator.start();

		const gain = audioContext.createGain();
		this.gain = gain;
		gain.gain.value = 0;
		oscillator.connect(gain);

		const offset = audioContext.createConstantSource();
		this.offset = offset;

		gain.connect(carrier);
		offset.connect(carrier);
	}

	setRange(changeType, min, max, time) {
		const multiplier = (max - min) / 2;
		const gain = this.gain.gain;
		gain.cancelAndHoldAtTime(time);
		gain[changeType](multiplier, time);

		const offset = this.offset.offset;
		offset.cancelAndHoldAtTime(time);
		offset[changeType](min + multiplier, time);
		this.min = min;
		this.max = max;
	}

}

class SynthSystem {
	constructor(audioContext, filterGain) {
		this.audioContext = audioContext;
		this.parameters = [
			'lowpass',	// filter type
			4400,		// filter frequency
			1,			// filter Q
		];
		const filter = audioContext.createBiquadFilter();
		this.filter = filter;
		filter.frequency.value = 4400;
		filter.gain.value = filterGain;

		const volume = audioContext.createGain();
		this.volume = volume;
		filter.connect(volume);
		volume.connect(audioContext.destination);
	}
}

class SynthChannel {
	constructor(system, pannedLeft) {
		const audioContext = system.audioContext;
		this.system = system;
		this.parameters = [
			2,		// attack (ms)
			50,		// decay (ms)
			300,	// release (ms)
			200,	// duration (ms)
			50,		// sustain (%)
			Gate.CLOSED, // gate
			'sine',	// waveform
			440,	// frequency
			69,		// MIDI note number
			0,		// detune
			100,	//	volume
			'sine', // tremolo shape
			5,		// tremolo frequency
			0,		// tremolo amount
			0,		// pan
			Voice.OSCILLATOR,
			[100, 100, 100], // relative proportions of the different sources
			1,		// filter enabled
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

		const tremoloGain = audioContext.createGain();
		envelope.connect(tremoloGain);
		const tremoloModulator = new Modulator(audioContext, tremoloGain.gain);
		this.tremolo = tremoloModulator;
		tremoloModulator.oscillator.frequency.value = 5;

		const panner = audioContext.createStereoPanner();
		this.panner = panner;
		this.panValue = pannedLeft? -1 : 1;
		tremoloGain.connect(panner);

		const volume = audioContext.createGain();
		this.volume = volume;
		panner.connect(volume);

		const filteredPath = audioContext.createGain();
		this.filteredPath = filteredPath;
		volume.connect(filteredPath);
		filteredPath.connect(system.filter);

		const unfilteredPath = audioContext.createGain();
		this.unfilteredPath = unfilteredPath;
		unfilteredPath.gain.value = 0;
		volume.connect(unfilteredPath);
		unfilteredPath.connect(system.volume);
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

	calcGains(when) {
		let voices = this.parameters[Parameter.VOICE];
		const mix = this.parameters[Parameter.MIX];
		let total = 0;
		for (let level of mix) {
			if ((voices & 1) == 1) {
				total += level;
			}
			voices = voices>>1;
		}
		if (total < 100) {
			total = 100;
		}
		const unit = 1 / total;
		const gains = this.gains;
		voices = this.parameters[Parameter.VOICE];
		for (let i = 0; i < mix.length; i++) {
			let param = gains[i].gain;
			param.cancelAndHoldAtTime(when);
			if ((voices & 1) === 1) {
				param.setValueAtTime(unit * mix[i], when);
			} else {
				param.setValueAtTime(0, when);
			}
			voices = voices>>1;
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
		let gainChange = false;
		let timeDifference;

		for (let [paramNumber, change] of parameterMap) {
			let changeType = change.type;
			let value = change.value;
			let param;
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
			} else if (paramNumber < 0) {
				if (changeType === ChangeType.DELTA) {
					changeType = ChangeType.SET;
					value += this.system.parameters[-paramNumber - 1];
				}
				this.system.parameters[-paramNumber - 1] = value;
			} else {
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
				value = Math.trunc(Math.abs(value)) % 2;
				param = this.panner.pan;
				param.cancelAndHoldAtTime(time);
				param.setValueAtTime(value === 0? 0 : this.panValue, time);
				this.parameters[Parameter.PANNED] = value;
				break;

			case Parameter.VOICE:
			case Parameter.MIX:
				gainChange = true;
				break;

			case Parameter.PULSE_WIDTH:
				param = this.pwm.parameters.get('width');
				param.cancelAndHoldAtTime(time);
				param[changeType](value, time);
				break;

			case Parameter.FILTERED:
				value = Math.trunc(Math.abs(value)) % 2;
				param = this.filteredPath.gain;
				const param2 = this.unfilteredPath.gain;
				param.cancelAndHoldAtTime(time);
				param2.cancelAndHoldAtTime(time);
				param.setValueAtTime(value, time);
				param2.setValueAtTime(1 - value, time);
				this.parameters[Parameter.FILTERED] = value;
				break;

			case Parameter.FILTER_TYPE:
				timeDifference = Math.round((time - now) * 1000);
				if (timeDifference > 0) {
					setTimeout(function () {
						me.system.filter.type = value;
					}, timeDifference);
				} else {
					this.system.filter.type = value;
				}
				break;

			case Parameter.FILTER_FREQUENCY:
				param = this.system.filter.frequency;
				param.cancelAndHoldAtTime(time);
				param[changeType](value, time);
				break;

			case Parameter.FILTER_Q:
				param = this.system.filter.Q;
				param.cancelAndHoldAtTime(time);
				param[changeType](value, time);
				break;

			}
		}
		if (gainChange) {
			this.calcGains(time);
		}
		if (dirtyEnvelope) {
			this.calcEnvelope(dirtyEnvelope);
		}
		if (gate !== undefined) {
			this.gate(time);
		}
	}

}
