export function eventosDemoParaPersona(personaId: string, inicioMs: number, finMs: number):
  { evento: "joined" | "left"; hora_ms: number }[];
