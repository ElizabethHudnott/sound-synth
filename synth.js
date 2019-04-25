(function (global) {
'use strict';

const NEARLY_ZERO = 1 / 65535;
const SEMITONE = 2 ** (1 / 12);
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

function volumeCurve(value) {
	if (value === 0) {
		return 0;
	} else {
		return 10 ** (-2 * (100 - value) / 99);
	}
}

const Parameter = Object.freeze({
	DELAY: 0,		//in 1/10,000ths of a second
	ATTACK: 1,		// in milliseconds
	HOLD: 2,		// in milliseconds
	DECAY: 3,		// in milliseconds
	RELEASE: 4,		// in milliseconds
	DURATION: 5,	// in milliseconds
	VELOCITY: 6,	// percentage
	SUSTAIN: 7,		// percentage
	GATE: 8,		// CLOSED, OPEN, TRIGGER or CUT
	WAVEFORM: 9,	// combinations of Waveform enum values
	FREQUENCY: 10,	// in hertz
	DETUNE: 11,		// in cents
	NOTES: 12,		// MIDI note number
	VIBRATO_WAVEFORM: 13, // 'sine', 'square', 'sawtooth' or 'triangle'
	VIBRATO_RATE: 14, // in hertz
	VIBRATO_EXTENT: 15, // in cents
	VOLUME: 16,		// percentage
	TREMOLO_WAVEFORM: 17, // 'sine', 'square', 'sawtooth' or 'triangle'
	TREMOLO_RATE: 18, // in hertz
	TREMOLO_AMOUNT: 19, // percentage
	PANNED: 20,		// 0 or 1
	SOURCE: 21,		// combinations of Source enum values
	PULSE_WIDTH: 22,// percentage
	FILTERED_AMOUNT: 23, // percentage
	FILTER_TYPE: 24, // 'lowpass', 'highpass', 'bandpass', 'notch', 'allpass', 'lowshelf', 'highshelf' or 'peaking'
	FILTER_FREQUENCY: 25, // in hertz
	FILTER_MIN_FREQUENCY: 26, // in hertz
	FILTER_MAX_FREQUENCY: 27, // in hertz
	FILTER_LFO_FREQUENCY: 28, // in hertz
	FILTER_WAVEFORM: 29, // 'sine', 'square', 'sawtooth' or 'triangle'
	FILTER_Q: 30,	// 0.0001 to 1000
	FILTER_GAIN: 31, // -40dB to 40dB
	RING_MODULATION: 32, // 0 to 100
	SYNC: 33,		// 0 or 1
	LINE_TIME: 34,	// in steps
	TICKS: 35, // maximum number of events during a LINE_TIME
	RETRIGGER: 36,	// number of ticks between retriggers
	CHORD_SPEED: 37, // number of ticks between notes of a broken chord
	CHORD_PATTERN: 38,
	GLISSANDO_SIZE: 39, // number of steps
	SAMPLE: 40,		// array index of the sample to play.
	SAMPLE_OFFSET: 41, // in seconds
});

const ChangeType = Object.freeze({
	SET: 'setValueAtTime',
	LINEAR: 'linearRampToValueAtTime',
	EXPONENTIAL: 'exponentialRampToValueAtTime',
	DELTA: '+',		//standalone or prefixed before LINEAR or EXPONENTIAL
	MULTIPLY: '*',	//standalone or prefixed before LINEAR or EXPONENTIAL
	MARK: '=',
});

class Change {
	constructor(type, value) {
		this.type = type;
		this.value = value;
	}
}

const Gate = Object.freeze({
	CLOSED: 0,
	CUT: 1,
	OPEN: 2,
	TRIGGER: 3,
});

const Waveform = Object.freeze({
	POP: 0,
	TRIANGLE: 1,
	SAWTOOTH: 2,
	PULSE: 4,
	NOISE: 8,
});

const Source = Object.freeze({
	OSCILLATOR: 0,
	SAMPLE: 1,
});

const Chord = Object.freeze({
	CYCLE: 0,
	TO_AND_FRO: 1,
	TO_AND_FRO_2: 2,
	RANDOM: 3,
})

const noteFrequencies = [];

for (let i = 0; i <= 127; i++) {
	noteFrequencies[i] = 2 ** ((i - 69) / 12) * 440;
}

class Modulator {
	constructor(audioContext, carrier) {
		this.carriers = [carrier];

		const oscillator = audioContext.createOscillator();
		this.oscillator = oscillator;
		oscillator.frequency.value = 5;

		const gain = audioContext.createGain();
		this.gain = gain;
		gain.gain.value = 0;
		oscillator.connect(gain);
		gain.connect(carrier);
	}

	start(when) {
		this.oscillator.start(when);
	}

	setMinMax(changeType, min, max, time) {
		const multiplier = (max - min) / 2;
		const centre = min + multiplier;
		this.gain.gain[changeType](multiplier, time);

		for (let carrier of this.carriers) {
			carrier[changeType](centre, time);
		}
	}

	setRange(changeType, range, time) {
		this.gain.gain[changeType](range, time);
	}

	setCentre(changeType, centre, time) {
		for (let carrier of this.carriers) {
			carrier[changeType](centre, time);
		}
	}

	connect(carrier) {
		this.gain.connect(carrier);
		const carriers = this.carriers;
		if (!carriers.includes(carrier)) {
			if (carriers.length > 0) {
				carrier.value = carriers[0].value;
			}
			this.carriers.push(carrier);
		}
	}

	disconnect(carrier) {
		const index = this.carriers.indexOf(carrier);
		if (index !== -1) {
			this.gain.disconnect(carrier);
			this.carriers.splice(index, 1);
		}
	}

	cancelAndHoldAtTime(when) {
		this.gain.gain.cancelAndHoldAtTime(when);
		for (let carrier of this.carriers) {
			carrier.cancelAndHoldAtTime(when);
		}
	}
}

class SynthSystem {
	constructor(audioContext, callback) {
		const me = this;
		audioContext.audioWorklet.addModule('audioworkletprocessors.js').then(function () {
			if (callback !== undefined) {
				callback(me);
			}
		});

		this.audioContext = audioContext;
		this.channels = [];
		this.samples = [];
		this.loopSample = [];
		this.sampleLoopStart = [];
		this.sampleLoopEnd = [];
		this.sampledNote = [];

		this.shortestTime = 1 / audioContext.sampleRate;
		this.startTime = audioContext.currentTime;
		this.tempoChanged = 0;
		this.systemParameters = [Parameter.LINE_TIME, Parameter.TICKS];

		const volume = audioContext.createGain();
		this.volume = volume;
		volume.connect(audioContext.destination);
	}

	addChannel(channel) {
		this.channels.push(channel);
	}

	begin() {
		const now = this.audioContext.currentTime;
		const startTime = this.startTime;
		const step = Math.trunc((now - startTime) / TIME_STEP);
		this.startTime = startTime + (step + 1) * TIME_STEP;
		this.tempoChanged = 0;
	}

	start() {
		const now = this.audioContext.currentTime;
		const startTime = (Math.trunc(now / TIME_STEP) + 1) * TIME_STEP;

		for (let channel of this.channels) {
			channel.start(startTime);
		}
		this.startTime = startTime;
	}

	loadSample(number, url, callback) {
		const me = this;

		if (this.samples[number] === undefined) {
			this.loopSample[number] = false;
			this.sampleLoopStart[number] = 0;
			this.sampleLoopEnd[number] = Number.MAX_VALUE;
			this.sampledNote[number] = 69;
		}

		const request = new XMLHttpRequest();
		request.open('GET', url);
		request.responseType = 'arraybuffer';
		request.timeout = 60000;

		request.addEventListener('load', function (event) {
	  		if (request.status < 400) {
		  		me.audioContext.decodeAudioData(request.response)
		  		.then(function(buffer) {
		  			me.samples[number] = buffer;
		  			callback(url, true, '');

		  		}).catch(function (error) {
		  			callback(url, false, error.message)
		  		});
		  	} else {
		  		callback(url, false, request.status + ' - ' + request.statusText);
		  	}
	  	});

		request.addEventListener('error', function (event) {
			callback(url, false,'Network error');
		});

		request.addEventListener('timeout', function (event) {
			dispatchError(url, false, 'Timeout');
		});

	 	request.send();
	}

	setSample(number, buffer) {
		if (this.samples[number] === undefined) {
			this.loopSample[number] = false;
			this.sampleLoopStart[number] = 0;
			this.sampleLoopEnd[number] = Number.MAX_VALUE;
			this.sampledNote[number] = 69;
		}
		this.samples[number] = buffer;
	}

	removeSample(number) {
		this.samples[number] = undefined;
	}

	getSamplePlayer(index) {
		const samplePlayer = this.audioContext.createBufferSource();
		const sample = this.samples[index];
		if (sample !== undefined) {
			samplePlayer.buffer = sample;
			const loop = this.loopSample[index];
			if (loop) {
				samplePlayer.loop = true;
				samplePlayer.loopStart = this.sampleLoopStart[index];
				samplePlayer.loopEnd = this.sampleLoopEnd[index];
			}
		} else {
			this.sampledNote[index] = 69;
		}
		return samplePlayer;
	}

	getSamplePeriod(index) {
		return 1 / noteFrequencies[this.sampledNote[index]];
	}

}

class C64OscillatorNode extends AudioWorkletNode {
	constructor(context) {
		super(context, 'c64-oscillator-processor', {numberOfInputs: 0, numberOfOutputs: 2});
		this._type = Waveform.TRIANGLE;
	}

	get frequency() {
		return this.parameters.get('frequency');
	}

	get width() {
		return this.parameters.get('width');
	}

	get sync() {
		return this.parameters.get('sync');
	}

	set type(value) {
		this.port.postMessage(value);
		this._type = value;
	}

	get type() {
		return this._type;
	}
}

class LogNode extends AudioWorkletNode {
	constructor(context) {
		super(context, 'log-processor', {numberOfOutputs: 0});
	}

	get steps() {
		return this.parameters('steps');
	}
}

class SubtractiveSynthChannel {
	constructor(system, pannedLeft) {
		const audioContext = system.audioContext;
		this.system = system;
		this.parameters = [
			10,		// delay
			2,		// attack
			0,		// hold
			50,		// decay
			300,	// release
			200,	// duration
			100,	// velocity
			70,		// sustain
			Gate.CLOSED, // gate
			Waveform.TRIANGLE, // waveform
			440,	// frequency
			0,		// detune
			[69],	// MIDI note numbers
			'sine',	// vibrato shape
			5,		// vibrato rate
			0,		// vibrato extent
			100,	//	volume
			'sine', // tremolo shape
			5,		// tremolo frequency
			0,		// tremolo amount
			0,		// pan
			Source.OSCILLATOR,
			50,		// pulse width
			100,	// filter fully enabled
			'lowpass', // filter type
			4400,	// filter frequency
			4400,	// minimum filter frequency
			4400,	// maximum filter frequency
			5,		// filter LFO frequency
			'sine',	// filter LFO shape
			1,		// filter Q
			0,		// filter gain
			0,		// ring modulation
			0,		// sync
			24,		// line time (125bpm, allegro)
			24,		// number of ticks for broken chords, glissando and retrigger
			0,		// retrigger time (ticks)
			1,		// broken chord speed
			Chord.TO_AND_FRO_2,	// chord pattern
			0,		// glissando length
			0,		// use first sample
			0,		// no sample offset
		];
		this.velocity = 1;
		this.sustain = volumeCurve(70); // combined sustain and velocity
		this.calcEnvelope(3);

		// State information for processing chords
		this.frequencies = [440];
		this.noteIndex = 0;
		this.chordDir = 1;
		this.noteRepeated = false;

		const oscillator = new C64OscillatorNode(audioContext);
		this.oscillator = oscillator;
		const oscillatorGain = audioContext.createGain();
		oscillator.connect(oscillatorGain);

		const syncGain = audioContext.createGain();
		syncGain.gain.value = 0;
		syncGain.connect(oscillator.sync);
		this.syncGain = syncGain;

		this.samplePlayer = undefined;
		const sampleGain = audioContext.createGain();
		sampleGain.gain.value = 0;
		this.sampleGain = sampleGain;
		const playRateMultiplier = audioContext.createGain();
		this.playRateMultiplier = playRateMultiplier;
		const samplePlaybackRate = audioContext.createConstantSource();
		samplePlaybackRate.connect(playRateMultiplier);
		samplePlaybackRate.start();

		const vibrato = new Modulator(audioContext, oscillator.frequency);
		this.vibrato = vibrato;
		vibrato.connect(samplePlaybackRate.offset);

		const ringMod = audioContext.createGain();
		const ringInput = audioContext.createGain();
		ringInput.connect(ringMod.gain);
		ringInput.gain.value = 0;
		this.ringMod = ringMod;
		this.ringInput = ringInput;

		oscillatorGain.connect(ringMod);
		sampleGain.connect(ringMod);
		this.gains = [oscillatorGain, sampleGain];

		const envelope = audioContext.createGain();
		this.envelope = envelope;
		envelope.gain.value = 0;
		ringMod.connect(envelope);

		const filter = audioContext.createBiquadFilter();
		this.filter = filter;
		filter.frequency.value = 4400;
		const filterLFO = new Modulator(audioContext, filter.frequency);
		this.filterLFO = filterLFO;

		const filteredPath = audioContext.createGain();
		this.filteredPath = filteredPath;
		envelope.connect(filteredPath);
		filteredPath.connect(filter);

		const unfilteredPath = audioContext.createGain();
		this.unfilteredPath = unfilteredPath;
		unfilteredPath.gain.value = 0;
		envelope.connect(unfilteredPath);

		const tremoloGain = audioContext.createGain();
		this.tremoloGain = tremoloGain;
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
		system.addChannel(this);
	}

	connect(channel) {
		const node = channel.ringInput;
		this.filter.connect(node);
		this.unfilteredPath.connect(node);
		this.oscillator.connect(channel.syncGain, 1);
	}

	start(when) {
		if (!this.started) {
			this.vibrato.start(when);
			this.tremolo.start(when);
			this.filterLFO.start(when);
			this.started = true;
		}
	}

	calcEnvelope(dirty) {
		const params = this.parameters;
		const delay = params[Parameter.DELAY] / 10;

		if (dirty & 1) {
			const endAttack = delay + params[Parameter.ATTACK];
			const endHold = endAttack + params[Parameter.HOLD];
			const endDecay = endHold + params[Parameter.DECAY];
			this.endDelay = delay / 1000;
			this.endAttack = endAttack / 1000;
			this.endHold = endHold / 1000;
			this.endDecay = endDecay / 1000;
		}
		if (dirty & 2) {
			const duration = delay + params[Parameter.DURATION];
			const release = params[Parameter.RELEASE];
			const endRelease = duration + release;
			this.release = release / 1000;
			this.beginRelease = duration / 1000;
			this.endRelease = endRelease / 1000;
		}
	}

	playSample(time) {
		if (this.samplePlayer !== undefined) {
			this.samplePlayer.stop(time);
		}
		const parameters = this.parameters;
		const sampleNumber = parameters[Parameter.SAMPLE];
		const samplePlayer = this.system.getSamplePlayer(sampleNumber);
		const multiplier = this.playRateMultiplier;
		multiplier.gain.setValueAtTime(this.system.getSamplePeriod(sampleNumber), time);
		multiplier.connect(samplePlayer.playbackRate);
		samplePlayer.connect(this.sampleGain);
		samplePlayer.start(time, parameters[Parameter.SAMPLE_OFFSET]);
		this.samplePlayer = samplePlayer;
	}

	gate(state, start) {
		const endDelay = this.endDelay;
		const velocity = this.velocity;
		const sustainLevel = this.sustain;
		let endDecay, beginRelease, endTime;

		const playSample = this.parameters[Parameter.SOURCE] === Source.SAMPLE;
		const gain = this.envelope.gain;
		gain.cancelAndHoldAtTime(start);

		switch (state) {
		case Gate.OPEN:
			gain.setTargetAtTime(0.01, start, endDelay * 2);
			gain.setValueAtTime(0.01, start + endDelay);
			gain.linearRampToValueAtTime(velocity, start + this.endAttack);
			gain.setValueAtTime(velocity, start + this.endHold);
			gain.linearRampToValueAtTime(sustainLevel, start + this.endDecay);
			break;

		case Gate.CLOSED:
			endTime = start + this.release;
			gain.exponentialRampToValueAtTime(NEARLY_ZERO, endTime - this.system.shortestTime);
			gain.setValueAtTime(0, endTime);
			if (this.samplePlayer !== undefined) {
				this.samplePlayer.stop(endTime);
				this.samplePlayer = undefined;
			}
			break;

		case Gate.TRIGGER:
			gain.setTargetAtTime(0.01, start, endDelay * 2);
			gain.setValueAtTime(0.01, start + endDelay);
			if (playSample) {
				this.playSample(start + endDelay);
			}
			gain.linearRampToValueAtTime(velocity, start + this.endAttack);
			gain.setValueAtTime(velocity, start + this.endHold);
			endDecay = start + this.endDecay;
			gain.linearRampToValueAtTime(sustainLevel, endDecay);

			if (!playSample) {
				beginRelease = start + this.beginRelease;
				if (endDecay < beginRelease) {
					gain.setValueAtTime(sustainLevel, beginRelease);
				} else {
					gain.cancelAndHoldAtTime(beginRelease);
				}
				endTime = start + this.endRelease;
				gain.exponentialRampToValueAtTime(NEARLY_ZERO, endTime - this.system.shortestTime);
				gain.setValueAtTime(0, endTime);
			}
			break;

		case Gate.CUT:
			gain.setTargetAtTime(0, start + endDelay, endDelay / 3);
			gain.setValueAtTime(0, start + endDelay);
			if (this.samplePlayer !== undefined) {
				this.samplePlayer.stop(start + endDelay);
				this.samplePlayer = undefined;
			}
			break;

		}
	}

	setFrequency(changeType, frequency, when) {
		frequency = frequency * CENT ** this.parameters[Parameter.DETUNE];
		const vibratoExtent = CENT ** (this.parameters[Parameter.VIBRATO_EXTENT] / 2);
		this.vibrato.cancelAndHoldAtTime(when);
		this.vibrato.setMinMax(changeType, frequency / vibratoExtent, frequency * vibratoExtent, when);
	}

	setParameters(parameterMap, step) {
		const me = this;
		const parameters = this.parameters;
		let gate = parameterMap.get(Parameter.GATE);
		if (gate !== undefined) {
			gate = gate.value;
		}

		let dirtyEnvelope = 0;
		let dirtySustain = false;
		let dirtyNumTicks = false;
		let frequencySet = false;
		let sampleChanged = false;

		const now = this.system.audioContext.currentTime;
		if (step === undefined) {
			step = (now - this.system.startTime) / TIME_STEP + 1;
		}
		step = Math.trunc(step);
		const time = this.system.startTime + step * TIME_STEP;
		const timeDifference = Math.round((time - now) * 1000);
		const callbacks = [];

		for (let [paramNumber, change] of parameterMap) {
			let changeType = change.type;
			let prefix, value;
			if (changeType === ChangeType.MARK) {
				value = parameters[paramNumber];
				changeType = ChangeType.SET;
				prefix = '';
			} else {
				value = change.value;
				prefix = changeType[0];
			}
			let frequency;

			if (paramNumber === Parameter.NOTES) {
				const list = parameters[paramNumber];

				if (prefix === ChangeType.DELTA) {
					for (let i = 0; i < value.length; i++) {
						list[i] = list[i] + list[i];
					}
					changeType = changeType.slice(1);
				} else {
					for (let i = 0; i < value.length; i++) {
						list[i] = value[i];
					}
				}

			} else {

				if (prefix === ChangeType.DELTA) {
					value += parameters[paramNumber];
					changeType = changeType.slice(1);
				} else if (prefix === ChangeType.MULTIPLY) {
					value *= parameters[paramNumber];
					changeType = changeType.slice(1);
				}
				parameters[paramNumber] = value;

			}

			if (changeType === "") {
				changeType = ChangeType.SET;
			}

			switch (paramNumber) {
			case Parameter.DELAY:
				dirtyEnvelope = 3;
				break;

			case Parameter.ATTACK:
			case Parameter.HOLD:
			case Parameter.DECAY:
				dirtyEnvelope = dirtyEnvelope | 1;
				break;

			case Parameter.RELEASE:
			case Parameter.DURATION:
				dirtyEnvelope = dirtyEnvelope | 2;
				break;

			case Parameter.VELOCITY:
				this.velocity = volumeCurve(value);
				dirtySustain = true;
				break;

			case Parameter.SUSTAIN:
				dirtySustain = true;
				break;

			case Parameter.WAVEFORM:
				callbacks.push(function () {
					me.oscillator.type = value;
				});
				break;

			case Parameter.VIBRATO_WAVEFORM:
				callbacks.push(function () {
					me.vibrato.oscillator.type = value;
				});
				break;

			case Parameter.TREMOLO_WAVEFORM:
				callbacks.push(function () {
					me.tremolo.oscillator.type = value;
				});
				break;

			case Parameter.FILTER_WAVEFORM:
				callbacks.push(function () {
					me.filterLFO.oscillator.type = value;
				});
				break;

			case Parameter.FREQUENCY:
				this.setFrequency(changeType, value, time);
				this.frequencies[0] = value;
				frequencySet = true;
				break;

			case Parameter.NOTES:
				frequency = noteFrequencies[value[0]];
				this.setFrequency(changeType, frequency, time);
				frequencySet = true;
				this.frequencies[0] = frequency;
				parameters[Parameter.FREQUENCY] = frequency;
				for (let i = 1; i < value.length; i++) {
					this.frequencies[i] = noteFrequencies[value[i]];
				}
				this.frequencies.splice(value.length);
				break;

			case Parameter.DETUNE:
			case Parameter.VIBRATO_EXTENT:
				this.setFrequency(changeType, parameters[Parameter.FREQUENCY], time);
				break;

			case Parameter.VOLUME:
				this.volume.gain[changeType](volumeCurve(value), time);
				break;

			case Parameter.VIBRATO_RATE:
				value = clamp(value);
				this.vibrato.oscillator.frequency[changeType](value, time);
				parameters[Parameter.VIBRATO_FREQUENCY] = value;
				break;

			case Parameter.TREMOLO_RATE:
				value = clamp(value);
				this.tremolo.oscillator.frequency[changeType](value, time);
				parameters[Parameter.TREMOLO_RATE] = value;
				break;

			case Parameter.TREMOLO_AMOUNT:
				this.tremolo.setMinMax(changeType, 1 - value / 100, 1, time);
				break;

			case Parameter.PANNED:
				value = Math.trunc(Math.abs(value)) % 2;
				this.panner.pan.setValueAtTime(value * this.panValue, time);
				parameters[Parameter.PANNED] = value;
				break;

			case Parameter.SYNC:
				value = Math.trunc(Math.abs(value)) % 2;
				this.syncGain.gain.setValueAtTime(value, time);
				parameters[Parameter.SYNC] = value;
				break;

			case Parameter.SOURCE:
				if (value === 0 && gate === undefined) {
					const currentGate = parameters[Parameter.GATE];
					if (currentGate === Gate.TRIGGER) {
						const param = this.envelope.gain;
						param.cancelAndHoldAtTime(time);
						param.setValueAtTime(0, time);
					}
				}
				for (let i = 0; i < this.gains.length; i++) {
					if (value === i) {
						this.gains[i].gain[changeType](1, time);
					} else {
						this.gains[i].gain[changeType](0, time);
					}
				}
				break;

			case Parameter.PULSE_WIDTH:
				this.oscillator.width[changeType](value / 100, time);
				break;

			case Parameter.FILTERED_AMOUNT:
				this.filteredPath.gain[changeType](value / 100, time);
				this.unfilteredPath.gain[changeType](1 - value / 100, time);
				break;

			case Parameter.FILTER_TYPE:
				callbacks.push(function () {
					me.filter.type = value;
				});
				break;

			case Parameter.FILTER_FREQUENCY:
				this.filterLFO.setMinMax(changeType, value, value, time);
				parameters[Parameter.FILTER_MIN_FREQUENCY] = value;
				parameters[Parameter.FILTER_MAX_FREQUENCY] = value;
				break;

			case Parameter.FILTER_MIN_FREQUENCY:
				this.filterLFO.setMinMax(changeType, value, parameters[Parameter.FILTER_MAX_FREQUENCY], time);
				break;

			case Parameter.FILTER_MAX_FREQUENCY:
				this.filterLFO.setMinMax(changeType, parameters[Parameter.FILTER_MIN_FREQUENCY], value, time);
				break;

			case Parameter.FILTER_LFO_FREQUENCY:
				this.filterLFO.oscillator.frequency[changeType](value, time);
				break;

			case Parameter.FILTER_Q:
				this.filter.Q[changeType](value, time);
				break;

			case Parameter.FILTER_GAIN:
				this.filter.gain[changeType](value, time);
				break;

			case Parameter.RING_MODULATION:
				this.ringMod.gain[changeType](1 - value / 100, time);
				this.ringInput.gain[changeType](value / 100, time);
				break;

			case Parameter.LINE_TIME:
				this.system.tempoChanged = step;
				dirtyNumTicks = true;
				break;

			case Parameter.TICKS:
				dirtyNumTicks = true;
				break;

			case Parameter.CHORD_PATTERN:
				if (value === Chord.CYCLE) {
					this.chordDir = 1;
				}
				break;

			case Parameter.SAMPLE:
				sampleChanged = true;
				break;

			case undefined:
				console.error('An undefined synthesizer parameter was used.');
				break;
			} // end switch
		} // end loop over each parameter

		if (dirtyEnvelope) {
			this.calcEnvelope(dirtyEnvelope);
		}
		if (dirtySustain) {
			this.sustain = volumeCurve(parameters[Parameter.VELOCITY] * parameters[Parameter.SUSTAIN] / 100);
		}
		if (dirtyNumTicks) {
			const numTicks = parameters[Parameter.TICKS];
			if (numTicks > parameters[Parameter.LINE_TIME]) {
				parameters[Parameter.TICKS] = parameters[Parameter.LINE_TIME];
			} else if (numTicks < 1) {
				parameters[Parameter.TICKS] = 1;
			}
			this.copyParameters([Parameter.LINE_TIME, Parameter.TICKS]);
		}

		const gateOpen = parameters[Parameter.GATE] === Gate.OPEN;
		const newLine = (step - this.system.tempoChanged) % parameters[Parameter.LINE_TIME] === 0;
		const frequencies = this.frequencies;
		let glissandoSteps = parameters[Parameter.GLISSANDO_SIZE];
		let glissandoAmount, prevGlissandoAmount, noteIndex, chordDir, noteRepeated;

		if (gate !== undefined) {
			this.gate(gate, time);
			glissandoAmount = 0;
			prevGlissandoAmount = 0;
			noteIndex = 0;
			chordDir = 1;
			noteRepeated = false;
			if (!frequencySet) {
				this.setFrequency(ChangeType.SET, frequencies[0], time);
			}
		} else if (gateOpen) {
			if (sampleChanged) {
				this.playSample(time);
			}
			// Don't repeat glissando but keep the chords smooth.
			glissandoAmount = glissandoSteps;
			prevGlissandoAmount = glissandoAmount;
			glissandoSteps = 0;
			noteIndex = this.noteIndex;
			chordDir = this.chordDir;
			noteRepeated = this.noteRepeated;
		}

		if ((gate & Gate.OPEN) > 0 || (gateOpen && newLine)) {
			// The gate's just been triggered or it's open.
			//TODO handle gate triggered in a previous step but not yet closed.
			//TODO handle gate status change not aligned with line start time.
			const numNotes = frequencies.length;
			const retriggerTicks = parameters[Parameter.RETRIGGER];

			if (glissandoSteps !== 0 || numNotes > 1 || retriggerTicks > 0) {
				const chordTicks = parameters[Parameter.CHORD_SPEED];
				const numTicks = parameters[Parameter.TICKS];
				const tickTime = (parameters[Parameter.LINE_TIME] * TIME_STEP) / numTicks;

				let glissandoPerTick;
				if (glissandoSteps === 0) {
					glissandoPerTick = 0;
				} else if (glissandoSteps > 0) {
				 	glissandoPerTick = (glissandoSteps + 1) / numTicks;
				} else {
					glissandoPerTick = (glissandoSteps - 1) / numTicks;
				}

				let tick = 1;
				const pattern = parameters[Parameter.CHORD_PATTERN];
				while (tick < numTicks) {
					const timeOfTick = time + tick * tickTime;

					if (glissandoSteps > 0) {
						glissandoAmount = Math.trunc(tick * glissandoPerTick);
					}
					let newFrequency = glissandoAmount !== prevGlissandoAmount;
					if (numNotes > 1 && tick % chordTicks === 0) {
						noteIndex = noteIndex + chordDir;
						switch (pattern) {
						case Chord.CYCLE:
							noteIndex = noteIndex % numNotes;
							newFrequency = true;
							break;

						case Chord.TO_AND_FRO:
							if (noteIndex === numNotes) {
								noteIndex = numNotes - 2;
								chordDir = -1;
							} else if (noteIndex === -1) {
								noteIndex = 1;
								chordDir = 1;
							}
							newFrequency = true;
							break;

						case Chord.TO_AND_FRO_2:
							if (noteIndex === numNotes) {
								if (noteRepeated) {
									noteIndex = numNotes - 2;
									chordDir = -1;
									newFrequency = true;
									noteRepeated = false;
								} else {
									noteIndex--;
									noteRepeated = true;
								}
							} else if (noteIndex === -1) {
								if (noteRepeated) {
									noteIndex = 1;
									chordDir = 1;
									newFrequency = true;
									noteRepeated = false;
								} else {
									noteIndex++;
									noteRepeated = true;
								}
							} else {
								newFrequency = true;
							}
							break;

						case Chord.RANDOM:
							const oldNoteIndex = noteIndex - 1;
							noteIndex = Math.trunc(Math.random() * numNotes);
							if (noteIndex !== oldNoteIndex) {
								newFrequency = true;
							}
							break;

						}
					}

					if (newFrequency) {
						const frequency = frequencies[noteIndex] * SEMITONE ** glissandoAmount;
						this.setFrequency(ChangeType.SET, frequency, timeOfTick);
					}

					if (tick % retriggerTicks === 0) {
						this.gate(Gate.TRIGGER, timeOfTick);
					}
					prevGlissandoAmount = glissandoAmount;
					tick++;
				}
				this.noteIndex = noteIndex;
				this.chordDir = chordDir;
				this.noteRepeated = noteRepeated;
			}
		}

		const numCallbacks = callbacks.length;
		if (numCallbacks > 0) {
			if (numCallbacks === 1) {
				setTimeout(callbacks[0], timeDifference);
			} else {
				setTimeout(function () {
					for (let callback of callbacks) {
						callback();
					}
				}, timeDifference);
			}
		}
	}

	copyParameters(paramNumbers) {
		const channels = this.system.channels;
		for (let paramNumber of paramNumbers) {
			const value = this.parameters[paramNumber];
			for (let channel of channels) {
				channel.parameters[paramNumber] = value;
			}
		}
	}

}

const keymap = new Map();
keymap.set('KeyZ', 48);
keymap.set('KeyS', 49);
keymap.set('KeyX', 50);
keymap.set('KeyD', 51);
keymap.set('KeyC', 52);
keymap.set('KeyV', 53);
keymap.set('KeyG', 54);
keymap.set('KeyB', 55);
keymap.set('KeyH', 56);
keymap.set('KeyN', 57);
keymap.set('KeyJ', 58);
keymap.set('KeyM', 59);
keymap.set('Comma', 60);
keymap.set('KeyL', 61);
keymap.set('Period', 62);
keymap.set('Semicolon', 63);
keymap.set('Slash', 64);
keymap.set('KeyQ', 60);
keymap.set('Digit2', 61);
keymap.set('KeyW', 62);
keymap.set('Digit3', 63);
keymap.set('KeyE', 64);
keymap.set('KeyR', 65);
keymap.set('Digit5', 66);
keymap.set('KeyT', 67);
keymap.set('Digit6', 68);
keymap.set('KeyY', 69);
keymap.set('Digit7', 70);
keymap.set('KeyU', 71);
keymap.set('KeyI', 72);
keymap.set('Digit9', 73);
keymap.set('KeyO', 74);
keymap.set('Digit0', 75);
keymap.set('KeyP', 76);
keymap.set('BracketLeft', 77);
keymap.set('Equal', 78);
keymap.set('BracketRight', 79);


global.Synth = {
	Change: Change,
	SubtractiveSynthChannel: SubtractiveSynthChannel,
	System: SynthSystem,
	ChangeType: ChangeType,
	Gate: Gate,
	Pattern: Chord,
	Param: Parameter,
	Source: Source,
	Waveform: Waveform,
	Modulator: Modulator,
	C64Oscillator: C64OscillatorNode,
	LogNode: LogNode,
	keymap: keymap,
	noteFrequencies: noteFrequencies,
	volumeCurve: volumeCurve,
};

})(window);
