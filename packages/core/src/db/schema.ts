import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const TAG_KINDS = ["tipo", "concepto", "estado", "medio_pago", "persona"] as const;
export type TagKind = (typeof TAG_KINDS)[number];

export const TAG_ALCANCES = ["general", "ingreso", "egreso"] as const;
export type TagAlcance = (typeof TAG_ALCANCES)[number];

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: TAG_KINDS }).notNull(),
  nombre: text("nombre").notNull(),
  color: text("color").notNull().default("#6b7280"),
  alcance: text("alcance", { enum: TAG_ALCANCES }).notNull().default("general"),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
});

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

export const MOVEMENT_DIRECTIONS = ["in", "out"] as const;
export type MovementDirection = (typeof MOVEMENT_DIRECTIONS)[number];

export const REGLA_OPS = ["div", "mul", "none"] as const;
export type ReglaOp = (typeof REGLA_OPS)[number];

export const movements = sqliteTable(
  "movements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fecha: text("fecha").notNull(),
    direccion: text("direccion", { enum: MOVEMENT_DIRECTIONS }).notNull(),
    monto_total: real("monto_total").notNull(),
    regla_op: text("regla_op", { enum: REGLA_OPS }).notNull().default("none"),
    regla_factor: real("regla_factor"),
    monto_efectivo: real("monto_efectivo").notNull(),
    detalle: text("detalle").notNull(),
    observacion: text("observacion"),
    installment_id: integer("installment_id"),
    source_movement_id: integer("source_movement_id"),
    imported_at: text("imported_at"),
    source_image_hash: text("source_image_hash"),
    pago_total_propio: integer("pago_total_propio", { mode: "boolean" }),
  },
  (table) => ({
    fechaIdx: index("idx_movements_fecha").on(table.fecha),
    sourceMovementIdx: index("idx_movements_source_movement_id").on(table.source_movement_id),
  })
);

export type Movement = typeof movements.$inferSelect;
export type NewMovement = typeof movements.$inferInsert;

export const movement_tags = sqliteTable(
  "movement_tags",
  {
    movement_id: integer("movement_id")
      .notNull()
      .references(() => movements.id, { onDelete: "cascade" }),
    tag_id: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.movement_id, table.tag_id] }),
  })
);

export type MovementTag = typeof movement_tags.$inferSelect;

export const movement_shares = sqliteTable(
  "movement_shares",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    movement_id: integer("movement_id")
      .notNull()
      .references(() => movements.id, { onDelete: "cascade" }),
    persona_tag_id: integer("persona_tag_id").references(() => tags.id),
    pagado: integer("pagado", { mode: "boolean" }).notNull().default(false),
    fecha_pago: text("fecha_pago"),
  },
  (table) => ({
    movementIdx: index("idx_movement_shares_movement_id").on(table.movement_id),
  })
);

export type MovementShare = typeof movement_shares.$inferSelect;
export type NewMovementShare = typeof movement_shares.$inferInsert;

export const proration_presets = sqliteTable("proration_presets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nombre: text("nombre").notNull().unique(),
  op: text("op", { enum: REGLA_OPS }).notNull(),
  factor: real("factor").notNull(),
  activo: integer("activo", { mode: "boolean" }).notNull().default(true),
});

export type ProrationPreset = typeof proration_presets.$inferSelect;
export type NewProrationPreset = typeof proration_presets.$inferInsert;

export const DEBT_DIRECTIONS = ["yo_debo", "me_deben"] as const;
export type DebtDirection = (typeof DEBT_DIRECTIONS)[number];

export const DEBT_FRECUENCIAS = ["mensual", "dias"] as const;
export type DebtFrecuencia = (typeof DEBT_FRECUENCIAS)[number];

export const debts = sqliteTable("debts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  descripcion: text("descripcion").notNull(),
  direccion: text("direccion", { enum: DEBT_DIRECTIONS }).notNull(),
  medio_pago_tag_id: integer("medio_pago_tag_id").references(() => tags.id),
  concepto_tag_id: integer("concepto_tag_id").references(() => tags.id),
  persona_tag_id: integer("persona_tag_id").references(() => tags.id),
  parent_debt_id: integer("parent_debt_id").references((): AnySQLiteColumn => debts.id),
  importe_total: real("importe_total").notNull(),
  cant_cuotas: integer("cant_cuotas").notNull(),
  ajuste_manual: real("ajuste_manual").notNull().default(0),
  fecha: text("fecha").notNull(),
  fecha_inicio: text("fecha_inicio").notNull(),
  frecuencia: text("frecuencia", { enum: DEBT_FRECUENCIAS }).notNull().default("mensual"),
  frecuencia_dias: integer("frecuencia_dias"),
  observacion: text("observacion"),
  deleted_at: text("deleted_at"),
});

export type Debt = typeof debts.$inferSelect;
export type NewDebt = typeof debts.$inferInsert;

export const INSTALLMENT_ESTADOS = ["pendiente", "pagada"] as const;
export type InstallmentEstado = (typeof INSTALLMENT_ESTADOS)[number];

export const installments = sqliteTable(
  "installments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    debt_id: integer("debt_id")
      .notNull()
      .references(() => debts.id, { onDelete: "cascade" }),
    nro: integer("nro").notNull(),
    importe: real("importe").notNull(),
    fecha_prevista: text("fecha_prevista").notNull(),
    estado: text("estado", { enum: INSTALLMENT_ESTADOS }).notNull().default("pendiente"),
    movement_id: integer("movement_id").references(() => movements.id),
    fecha_pago: text("fecha_pago"),
    observacion: text("observacion"),
  },
  (table) => ({
    debtIdx: index("idx_installments_debt_id").on(table.debt_id),
    fechaIdx: index("idx_installments_fecha_prevista").on(table.fecha_prevista),
  })
);

export type Installment = typeof installments.$inferSelect;
export type NewInstallment = typeof installments.$inferInsert;

export const DUPLICATE_NIVELES = ["exacto", "reglas", "criterio"] as const;
export type DuplicateNivel = (typeof DUPLICATE_NIVELES)[number];

export const FINDING_ESTADOS = ["pendiente", "confirmado", "descartado"] as const;
export type FindingEstado = (typeof FINDING_ESTADOS)[number];

export const duplicate_findings = sqliteTable(
  "duplicate_findings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    nivel: text("nivel", { enum: DUPLICATE_NIVELES }).notNull(),
    movement_a_id: integer("movement_a_id")
      .notNull()
      .references(() => movements.id, { onDelete: "cascade" }),
    movement_b_id: integer("movement_b_id").references(() => movements.id, {
      onDelete: "cascade",
    }),
    // Payload del candidato que todavía no está en la DB (nivel 1 durante el import).
    candidato_json: text("candidato_json"),
    motivo: text("motivo").notNull(),
    score: real("score"),
    detectado_en: text("detectado_en").notNull(),
    estado: text("estado", { enum: FINDING_ESTADOS }).notNull().default("pendiente"),
  },
  (table) => ({
    estadoIdx: index("idx_findings_estado").on(table.estado),
  })
);

export type DuplicateFinding = typeof duplicate_findings.$inferSelect;
export type NewDuplicateFinding = typeof duplicate_findings.$inferInsert;

export const INVISIBLE_MODOS = ["exacto", "contiene"] as const;
export type InvisibleModo = (typeof INVISIBLE_MODOS)[number];

export const invisible_rules = sqliteTable("invisible_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // null = aplica a ambas direcciones
  direccion: text("direccion", { enum: MOVEMENT_DIRECTIONS }),
  patron: text("patron").notNull(),
  modo: text("modo", { enum: INVISIBLE_MODOS }).notNull().default("exacto"),
  activa: integer("activa", { mode: "boolean" }).notNull().default(true),
});

export type InvisibleRule = typeof invisible_rules.$inferSelect;
export type NewInvisibleRule = typeof invisible_rules.$inferInsert;
