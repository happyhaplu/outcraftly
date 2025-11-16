import { registerCounter } from '@/lib/metrics';

const heartbeats = new Map<string, Date>();

const heartbeatCounter = registerCounter('worker_heartbeat_updates', {
  name: 'worker_heartbeat_updates',
  description: 'Total worker heartbeat updates recorded in-memory'
});

export const recordHeartbeat = (workerName: string) => {
  heartbeats.set(workerName, new Date());
  heartbeatCounter.increment();
};

export const getHeartbeatSnapshot = () =>
  Array.from(heartbeats.entries()).map(([worker, timestamp]) => ({
    worker,
    lastBeatAt: timestamp.toISOString()
  }));
