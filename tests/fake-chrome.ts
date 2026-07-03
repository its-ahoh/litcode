export function installFakeChrome() {
  const data: Record<string, unknown> = {};
  (globalThis as any).chrome = {
    storage: {
      local: {
        async get(key: string) {
          return { [key]: data[key] };
        },
        async set(items: Record<string, unknown>) {
          Object.assign(data, items);
        },
      },
      onChanged: { addListener() {} },
    },
  };
  return data;
}
