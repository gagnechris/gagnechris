import { getRandomValues } from 'expo-crypto';
import { installGetRandomValues } from './crypto';

installGetRandomValues(globalThis, getRandomValues);
