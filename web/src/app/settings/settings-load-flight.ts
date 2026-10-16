export type SettingsRequestFlight<Result = void> = {
  value: Promise<Result> | null;
};

const settingsRequestFlights = new Set<SettingsRequestFlight<unknown>>();
let settingsRequestGeneration = 0;

export function invalidateSettingsRequests() {
  settingsRequestGeneration += 1;
  settingsRequestFlights.forEach((flight) => {
    flight.value = null;
  });
}

export function runSettingsRequest<Result>(
  flight: SettingsRequestFlight<Result>,
  task: (isCurrent: () => boolean) => Promise<Result>,
): Promise<Result> {
  if (flight.value) return flight.value;
  settingsRequestFlights.add(flight);
  const generation = settingsRequestGeneration;
  const request = task(() => generation === settingsRequestGeneration);
  flight.value = request;
  void request
    .finally(() => {
      if (flight.value === request) flight.value = null;
    })
    .catch(() => undefined);
  return request;
}
