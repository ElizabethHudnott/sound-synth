'use strict';
const audioContext = new AudioContext({sampleRate: 96000});
audioContext.audioWorklet.addModule('audioworkletprocessors.js');

const NEARLY_ZERO = (1 / 65535) / 2;
const CENT = 2 ** (1 / 1200);

const LFO_MAX = 25;
const TIME_STEP = 0.02; // 50 steps per second

function clamp(value) {
	if (value > LFO_MAX) {
		return LFO_MAX;
	} else if (value < -LFO_MAX) {
		return -LFO_MAX;
	} else {
		return value;
	}
}

const Parameter = Object.freeze({
	ATTACK: 0,		// in milliseconds
	DECAY: 1,		// in milliseconds
	RELEASE: 2,		// in milliseconds
	DURATION: 3,	// in milliseconds
	VELOCITY: 4,	// percentage
	SUSTAIN: 5,		// percentage
	GATE: 6,		// CLOSED, OPEN or TRIGGER
	WAVEFORM: 7,	// 'sine', 'square', 'sawtooth' or 'triangle'
	FREQUENCY: 8,	// in hertz
	NOTE: 9,		// MIDI note number
	DETUNE: 10,		// in cents
	VIBRATO_WAVEFORM: 11, // 'sine', 'square', 'sawtooth' or 'triangle'
	VIBRATO_RATE: 12, // in hertz
	VIBRATO_EXTENT: 13, // in cents
	VOLUME: 14,		// percentage
	TREMOLO_WAVEFORM: 15, // 'sine', 'square', 'sawtooth' or 'triangle'
	TREMOLO_FREQUENCY: 16, // in hertz
	TREMOLO_AMOUNT: 17, // percentage
	PANNED: 18,		// 0 or 1
	VOICE: 19,		// Combinations of Voice enum values
	MIX: 20,		// Relative volumes
	PULSE_WIDTH: 21,// percent
	FILTERED_AMOUNT: 12, // percentage
	FILTER_TYPE: 23, // 'lowpass', 'highpass', 'bandpass', 'notch', 'allpass', 'lowshelf', 'highshelf' or 'peaking'
	FILTER_FREQUENCY: 24, // in hertz
	FILTER_Q: 24,	// 0.0001 to 1000
});

const ChangeType = Object.freeze({
	SET: 'setValueAtTime',
	LINEAR: 'linearRampToValueAtTime',
	EXPONENTIAL: 'exponentialRampToValueAtTime',
	DELTA: 'delta',		//standalone or prefixed before LINEAR or EXPONENTIAL
	MULTIPLY: 'multi',	//standalone or prefixed before LINEAR or EXPONENTIAL
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
		this.filterGain = filterGain;
		const volume = audioContext.createGain();
		this.volume = volume;
		volume.connect(audioContext.destination);
	}
}

class SynthChannel {
	constructor(system, pannedLeft) {
		const audioContext = system.audioContext;
		this.system = system;
		this.parameters = [
			2,		// attack
			50,		// decay
			300,	// release
			200,	// duration
			100,	// velocity
			50,		// sustain
			Gate.CLOSED, // gate
			'sine',	// waveform
			440,	// frequency
			69,		// MIDI note number
			0,		// detune
			'sine',	// vibrato shape
			5,		// vibrato rate
			0,		// vibrato extent
			100,	//	volume
			'sine', // tremolo shape
			5,		// tremolo frequency
			0,		// tremolo amount
			0,		// pan
			Voice.OSCILLATOR,
			[100, 100, 100], // relative proportions of the different sources
			50,		// pulse width
			100,	// filter fully enabled
			'lowpass', // filter type
			4400,	// filter frequency
			1,		// filter Q
		];
		this.velocity = 1;
		this.sustain = this.parameters[Parameter.SUSTAIN] / 100;
		this.calcEnvelope(3)

		const oscillator = audioContext.createOscillator();
		oscillator.start();
		this.oscillator = oscillator;
		const oscillatorGain = audioContext.createGain();
		oscillator.connect(oscillatorGain);

		const vibrato = new Modulator(audioContext, oscillator.frequency);
		this.vibrato = vibrato;
		vibrato.setRange(ChangeType.SET, 440, 440, audioContext.currentTime);

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

		const filter = audioContext.createBiquadFilter();
		this.filter = filter;
		filter.frequency.value = 4400;
		filter.gain.value = system.filterGain;

		const filteredPath = audioContext.createGain();
		this.filteredPath = filteredPath;
		envelope.connect(filteredPath);
		filteredPath.connect(filter);

		const unfilteredPath = audioContext.createGain();
		this.unfilteredPath = unfilteredPath;
		unfilteredPath.gain.value = 0;
		envelope.connect(unfilteredPath);

		const tremoloGain = audioContext.createGain();
		const tremoloModulator = new Modulator(audioContext, tremoloGain.gain);
		this.tremolo = tremoloModulator;
		filter.connect(tremoloGain);
		unfilteredPath.connect(tremoloGain);

		const panner = audioContext.createStereoPanner();
		this.panner = panner;
		this.panValue = pannedLeft? -1 : 1;
		tremoloGain.connect(panner);

		const volume = audioContext.createGain();
		this.volume = volume;
		panner.connect(volume);

		volume.connect(system.volume);

		this.startTime = audioContext.currentTime;
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
			gain.linearRampToValueAtTime(this.velocity, start + this.endAttack);
			gain.linearRampToValueAtTime(this.sustain * this.velocity, start + this.endDecay);
			break;
		case Gate.CLOSED:
			endTime = start + this.release;
			gain.exponentialRampToValueAtTime(NEARLY_ZERO, endTime);
			break;
		case Gate.TRIGGER:
			const sustainLevel = this.sustain * this.velocity;
			gain.linearRampToValueAtTime(this.velocity, start + this.endAttack);
			gain.linearRampToValueAtTime(sustainLevel, start + this.endDecay);
			const beginRelease = start + this.beginRelease;
			gain.linearRampToValueAtTime(sustainLevel, beginRelease);
			endTime = start + this.endRelease;
			gain.exponentialRampToValueAtTime(NEARLY_ZERO, endTime);
		}
	}

	setFrequency(changeType, frequency, when) {
		const vibratoAmount = CENT ** this.parameters[Parameter.VIBRATO_EXTENT] / 2;
		this.vibrato.setRange(changeType, frequency - vibratoExtent, frequency + vibratoExtent, when);
	}

	setDetune(changeType, cents, when) {
		let param = this.oscillator.detune;
		param.cancelAndHoldAtTime(when);
		param[changeType](cents, when);
	}

	begin() {
		this.startTime = (Math.trunc(this.system.audioContext.currentTime / TIME_STEP) + 1) * TIME_STEP;
	}

	setParameters(parameterMap, step) {
		const me = this;
		const gate = parameterMap.get(Parameter.GATE);
		let dirtyEnvelope = 0;
		let gainChange = false;
		let timeDifference;

		const time = this.startTime + step * TIME_STEP;
		const now = this.system.audioContext.currentTime;

		for (let [paramNumber, change] of parameterMap) {
			let changeType = change.type;
			const prefix = changeType.slice(0, 5);
			let value = change.value;
			let param, frequency;

			if (paramNumber === Parameter.MIX) {

				const mix = this.parameters[Parameter.MIX]
				if (prefix === ChangeType.DELTA) {
					for (let i = 0; i < value.length; i++) {
						mix[i] = mix[i] + value[i];
					}
					changeType = changeType.slice(5);
				} else {
					for (let i = 0; i < value.length; i++) {
						mix[i] = value[i];
					}
				}

			} else {

				if (prefix === ChangeType.DELTA) {
					value += this.parameters[paramNumber];
					changeType = changeType.slice(5);
				} else if (prefix === ChangeType.MULTIPLY) {
					value *= this.parameters[paramNumber];
					changeType = changeType.slice(5);
				}
				this.parameters[paramNumber] = value;

			}

			if (changeType === "") {
				changeType = ChangeType.SET;
			}

			switch (paramNumber) {
			case Parameter.ATTACK:
			case Parameter.DECAY:
				dirtyEnvelope = dirtyEnvelope | 1;
				break;

			case Parameter.RELEASE:
			case Parameter.DURATION:
				dirtyEnvelope = dirtyEnvelope | 2;
				break;

			case Parameter.VELOCITY:
				this.velocity = 10 ** -((100 - value) / 99);
				break;

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

			case Parameter.TREMOLO_WAVEFORM:
				timeDifference = Math.round((time - now) * 1000);
				if (timeDifference > 0) {
					setTimeout(function () {
						me.tremolo.oscillator.type = value;
					}, timeDifference);
				} else {
					this.tremolo.oscillator.type = value;
				}
				break;

			case Parameter.FREQUENCY:
				this.setFrequency(changeType, value, time);
				break;

			case Parameter.NOTE:
				frequency = noteFrequencies[value];
				this.setFrequency(changeType, frequency, time);
				this.parameters[Parameter.FREQUENCY] = frequency;
				break;

			case Parameter.DETUNE:
				this.setDetune(changeType, value, time);
				break;

			case Parameter.VOLUME:
				param = this.volume.gain;
				param.cancelAndHoldAtTime(time);
				if (value === 0) {
					param[changeType](0, time);
				} else {
					param[changeType](10 ** -((100 - value) / 99), time);
				}
				break;

			case Parameter.TREMOLO_FREQUENCY:
				value = clamp(value);
				param = this.tremolo.oscillator.frequency;
				param.cancelAndHoldAtTime(time);
				param[changeType](value, time);
				this.parameters[Parameter.TREMOLO_FREQUENCY] = value;
				break;

			case Parameter.TREMOLO_AMOUNT:
				this.tremolo.setRange(changeType, 1 - value / 100, 1, time);
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
				param[changeType](value / 100, time);
				break;

			case Parameter.FILTERED_AMOUNT:
				param = this.filteredPath.gain;
				const param2 = this.unfilteredPath.gain;
				param.cancelAndHoldAtTime(time);
				param2.cancelAndHoldAtTime(time);
				param.setValueAtTime(value / 100, time);
				param2.setValueAtTime(1 - value / 100, time);
				break;

			case Parameter.FILTER_TYPE:
				timeDifference = Math.round((time - now) * 1000);
				if (timeDifference > 0) {
					setTimeout(function () {
						me.filter.type = value;
					}, timeDifference);
				} else {
					this.filter.type = value;
				}
				break;

			case Parameter.FILTER_FREQUENCY:
				param = this.filter.frequency;
				param.cancelAndHoldAtTime(time);
				param[changeType](value, time);
				break;

			case Parameter.FILTER_Q:
				param = this.filter.Q;
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
