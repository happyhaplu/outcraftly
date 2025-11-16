type CounterConfig = {
  name: string;
  description?: string;
};

class Counter {
  private value = 0;

  constructor(public readonly config: CounterConfig) {}

  increment(amount = 1) {
    this.value += amount;
  }

  getValue() {
    return this.value;
  }
}

const counters = new Map<string, Counter>();

export const registerCounter = (key: string, config: CounterConfig) => {
  if (!counters.has(key)) {
    counters.set(key, new Counter(config));
  }
  return counters.get(key)!;
};

export const incrementCounter = (key: string, amount = 1) => {
  const counter = counters.get(key);
  if (counter) {
    counter.increment(amount);
  }
};

export const getMetricsSnapshot = () => {
  return Array.from(counters.entries()).map(([key, counter]) => ({
    key,
    description: counter.config.description,
    value: counter.getValue()
  }));
};
