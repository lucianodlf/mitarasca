import type { DebtDirection, TagKind } from "../db/schema.js";
import { DEBT_DIRECTIONS } from "../db/schema.js";

export type DebtTagRef = { id: number; kind: TagKind };

export type DebtValidationError =
  | { code: "INVALID_DIRECCION"; direccion: string }
  | { code: "INVALID_IMPORTE_TOTAL" }
  | { code: "INVALID_CANT_CUOTAS" }
  | { code: "MEDIO_PAGO_NOT_FOUND"; tagId: number }
  | { code: "INVALID_MEDIO_PAGO_KIND"; tagId: number; kind: TagKind }
  | { code: "PERSONA_NOT_FOUND"; tagId: number }
  | { code: "INVALID_PERSONA_KIND"; tagId: number; kind: TagKind };

export type DebtValidationResult = { ok: true } | { ok: false; errors: DebtValidationError[] };

export type ValidateDebtInput = {
  direccion: string;
  importe_total: number;
  cant_cuotas: number;
  medioPagoTag?: DebtTagRef | null | undefined;
  medioPagoTagId?: number | null | undefined;
  personaTag?: DebtTagRef | null | undefined;
  personaTagId?: number | null | undefined;
};

export function validateDebtInput(input: ValidateDebtInput): DebtValidationResult {
  const errors: DebtValidationError[] = [];

  if (!(DEBT_DIRECTIONS as readonly string[]).includes(input.direccion)) {
    errors.push({ code: "INVALID_DIRECCION", direccion: input.direccion });
  }

  if (!(input.importe_total > 0)) {
    errors.push({ code: "INVALID_IMPORTE_TOTAL" });
  }

  if (!Number.isInteger(input.cant_cuotas) || input.cant_cuotas < 1) {
    errors.push({ code: "INVALID_CANT_CUOTAS" });
  }

  if (input.medioPagoTagId != null) {
    if (!input.medioPagoTag) {
      errors.push({ code: "MEDIO_PAGO_NOT_FOUND", tagId: input.medioPagoTagId });
    } else if (input.medioPagoTag.kind !== "medio_pago") {
      errors.push({
        code: "INVALID_MEDIO_PAGO_KIND",
        tagId: input.medioPagoTag.id,
        kind: input.medioPagoTag.kind,
      });
    }
  }

  if (input.personaTagId != null) {
    if (!input.personaTag) {
      errors.push({ code: "PERSONA_NOT_FOUND", tagId: input.personaTagId });
    } else if (input.personaTag.kind !== "persona") {
      errors.push({
        code: "INVALID_PERSONA_KIND",
        tagId: input.personaTag.id,
        kind: input.personaTag.kind,
      });
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export function isDebtDirection(value: string): value is DebtDirection {
  return (DEBT_DIRECTIONS as readonly string[]).includes(value);
}
