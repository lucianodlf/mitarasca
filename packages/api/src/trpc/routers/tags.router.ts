import {
  createTag,
  deactivateTag,
  getTagById,
  listTags,
  listTagsByKind,
  updateTag,
} from "@mitarasca/core";
import { z } from "zod";
import { stripUndefined } from "../strip-undefined.js";
import { publicProcedure, router } from "../trpc.js";

const tagKind = z.enum(["tipo", "concepto", "estado", "medio_pago", "persona"]);
const tagAlcance = z.enum(["general", "ingreso", "egreso"]);

export const tagsRouter = router({
  list: publicProcedure
    .input(z.object({ soloActivos: z.boolean().optional() }).optional())
    .query(({ input }) => listTags(input ? stripUndefined(input) : undefined)),

  listByKind: publicProcedure
    .input(
      z.object({
        kind: tagKind,
        soloActivos: z.boolean().optional(),
        alcance: z.union([tagAlcance, z.array(tagAlcance)]).optional(),
      })
    )
    .query(({ input }) =>
      listTagsByKind(
        input.kind,
        stripUndefined({ soloActivos: input.soloActivos, alcance: input.alcance })
      )
    ),

  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => getTagById(input.id)),

  create: publicProcedure
    .input(
      z.object({
        kind: tagKind,
        nombre: z.string(),
        color: z.string().optional(),
        alcance: tagAlcance.optional(),
        activo: z.boolean().optional(),
      })
    )
    .mutation(({ input }) => createTag(stripUndefined(input))),

  update: publicProcedure
    .input(
      z.object({
        id: z.number(),
        data: z.object({
          nombre: z.string().optional(),
          color: z.string().optional(),
          alcance: tagAlcance.optional(),
          activo: z.boolean().optional(),
        }),
      })
    )
    .mutation(({ input }) => updateTag(input.id, stripUndefined(input.data))),

  deactivate: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => deactivateTag(input.id)),
});
