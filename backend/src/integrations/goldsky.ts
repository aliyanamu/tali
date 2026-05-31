// Goldsky pipeline address management — week 2.
// The watched address list is compiled into a static SQL WHERE clause in
// backend/goldsky/pipeline.yaml at deploy time.
//
// To add a new watched wallet, update the SQL transform in pipeline.yaml and redeploy:
//   goldsky pipeline apply --path backend/goldsky/pipeline.yaml
export async function addWatchAddress(_address: string): Promise<void> {
  // TODO week-2: update pipeline.yaml SQL and redeploy via goldsky CLI
}

export async function removeWatchAddress(_address: string): Promise<void> {
  // TODO week-2: update pipeline.yaml SQL and redeploy via goldsky CLI
}
