const STEP_COUNT = 16;
const MAX_VELOCITY = 3;
const DEFAULT_VOLUME = 0.8;
const DEFAULT_TEMPO = 120;
const MIN_TEMPO = 60;
const MAX_TEMPO = 180;
const DEFAULT_PRESET = 'rock';
const MAX_STEPS = 32;
const DEFAULT_SWING = 0;
const DEFAULT_PITCH = 0;
const DEFAULT_DECAY = 0.5;

const APP_VERSION = '2.3';

const VELOCITY_MAP = { 1: 0.33, 2: 0.66, 3: 1.0 };

// Scheduler lookahead constants
const SCHEDULE_AHEAD_TIME = 0.1;   // seconds to schedule ahead
const SCHEDULE_INTERVAL = 25;      // ms between scheduler ticks

const DRUMS = [
    { id: 'kick',    label: 'Kick' },
    { id: 'snare',   label: 'Snare' },
    { id: 'hihat',   label: 'Hi-Hat' },
    { id: 'openhat', label: 'Open Hat' },
    { id: 'clap',    label: 'Clap' },
    { id: 'cowbell', label: 'Cowbell' },
    { id: 'tomlo',   label: 'Tom Lo' },
    { id: 'tommi',   label: 'Tom Mid' },
    { id: 'tomhi',   label: 'Tom Hi' },
    { id: 'rimshot', label: 'Rimshot' },
    { id: 'maracas', label: 'Maracas' }
];
