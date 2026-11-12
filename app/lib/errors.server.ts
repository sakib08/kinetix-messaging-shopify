export class ApiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ message: error.message }, { status: error.status });
  }
  console.error(error);
  const message = error instanceof Error ? error.message : "Something went wrong";
  return Response.json({ message }, { status: 500 });
}
