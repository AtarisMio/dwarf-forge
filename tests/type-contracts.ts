// Compile-time regressions: these assertions fail if a public boundary widens
// to unrestricted values or loses its success/failure discrimination.
import type {ForgeGame} from '../src/simulation.ts';
import type {GameState, SwordState, SwordTypeId, RelicId, Outcome, StrikeResult} from '../src/game-types.ts';
import type {Workshop, WorkshopCallbacks, ShopAction} from '../src/workshop-types.ts';
import type {MouseLookSurface, InputDocument} from '../src/mouse-look.ts';
import type {TouchMovementSurface} from '../src/touch-movement.ts';
import type {ForgeAudioContext} from '../src/audio.ts';

type Expect<T extends true> = T;
type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assignable<A, B> = [A] extends [B] ? true : false;
type Not<T extends boolean> = T extends true ? false : true;

export type TypeContracts = [
  Expect<Same<ForgeGame['state'], GameState>>,
  Expect<Same<ForgeGame['current'], SwordState | null>>,
  Expect<Same<Parameters<typeof ForgeGame.restore>[0], unknown>>,
  Expect<Same<ReturnType<typeof ForgeGame.restore>, ForgeGame | null>>,
  Expect<Not<Assignable<string, SwordTypeId>>>,
  Expect<Not<Assignable<string, RelicId>>>,
  Expect<Not<Assignable<'critical', Outcome>>>,
  Expect<Not<Assignable<'oven', SwordState['location']>>>,
  Expect<Same<Extract<StrikeResult, {ok: false}>['message'], string>>,
  Expect<Same<Extract<StrikeResult, {ok: true}>['sword'], SwordState>>,
  Expect<Not<Assignable<{ok: true}, StrikeResult>>>,
  Expect<Not<Assignable<{type: 'buy'}, ShopAction>>>,
  Expect<Not<Assignable<{type: 'buy'; id: 'invented-relic'}, ShopAction>>>,
  Expect<Same<Parameters<NonNullable<WorkshopCallbacks['onSword']>>[0], number>>,
  Expect<Same<ReturnType<Workshop['beginHeating']>, Promise<boolean>>>,
  Expect<Assignable<HTMLCanvasElement, MouseLookSurface>>,
  Expect<Assignable<HTMLElement, TouchMovementSurface>>,
  Expect<Assignable<Document, InputDocument>>,
  Expect<Assignable<AudioContext, ForgeAudioContext>>,
];
