export type Obstacle = { id: number; x: number; width: number; height: number };
export type Game = {
  status: 'playing' | 'paused' | 'over';
  elapsed: number;
  distance: number;
  lift: number;
  velocity: number;
  obstacles: Obstacle[];
  spawnIn: number;
  nextId: number;
};

const GRAVITY = 1550;
export function scoreOf(game: Game) { 'worklet'; return Math.floor(game.elapsed * 10 + 1e-7); }
export function initialGame(): Game {
  'worklet';
  return { status: 'playing', elapsed: 0, distance: 0, lift: 0, velocity: 0,
    obstacles: [], spawnIn: 1.5, nextId: 1 };
}

export function jump(game: Game, height: number): Game {
  'worklet';
  if (game.status !== 'playing' || game.lift > 0 || game.velocity > 0) return game;
  return { ...game, velocity: Math.sqrt(2 * GRAVITY * height * 0.38) };
}

function advance(game: Game, delta: number, width: number, height: number): Game {
  'worklet';
  const elapsed = game.elapsed + delta;
  const speed = (Math.min(410, 210 + game.elapsed * 4) + Math.min(410, 210 + elapsed * 4)) / 2;
  const rawLift = game.lift + game.velocity * delta - 0.5 * GRAVITY * delta * delta;
  const lift = Math.max(0, rawLift);
  const velocity = lift === 0 ? 0 : game.velocity - GRAVITY * delta;
  const nextId = game.nextId + (game.spawnIn <= delta ? 1 : 0);
  const spawnIn = game.spawnIn <= delta
    ? 1.55 + Math.random() * 0.55
    : game.spawnIn - delta;
  const obstacles = game.obstacles
    .map(o => ({ ...o, x: o.x - speed * delta }))
    .filter(o => o.x + o.width > -10);
  if (nextId !== game.nextId) {
    obstacles.push({
      id: game.nextId, x: width + 12,
      width: height * (0.073 + Math.random() * 0.019),
      height: height * (0.19 + Math.random() * 0.06),
    });
  }
  const playerLeft = width * 0.14 + height * 0.02;
  const playerRight = width * 0.14 + height * 0.14;
  const playerBottom = height * 0.79 - lift;
  const playerTop = playerBottom - height * 0.145;
  const collides = obstacles.some(o => {
    const cactusLeft = o.x + o.width * 0.2;
    const cactusRight = o.x + o.width * 0.8;
    const cactusTop = height * 0.79 - o.height * 0.94;
    return playerRight > cactusLeft && playerLeft < cactusRight &&
      playerBottom > cactusTop && playerTop < height * 0.79;
  });
  return {
    ...game, status: collides ? 'over' : 'playing', elapsed,
    distance: game.distance + speed * delta, lift, velocity,
    obstacles, spawnIn, nextId,
  };
}

export function step(game: Game, dt: number, width: number, height: number): Game {
  'worklet';
  if (game.status !== 'playing' || width <= 0 || height <= 0) return game;
  let remaining = Math.min(Math.max(dt, 0), 0.5);
  let current = game;
  while (remaining > 0 && current.status === 'playing') {
    const slice = Math.min(remaining, 1 / 120);
    current = advance(current, slice, width, height);
    remaining -= slice;
  }
  return current;
}
