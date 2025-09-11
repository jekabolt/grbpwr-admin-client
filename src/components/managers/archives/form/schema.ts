import { z } from "zod";



export const schema = z.object({
    tag: z.string().min(1, "Tag is required"),
    mediaIds: z.array(z.number()).default([]),
    mainMediaId: z.number().optional(),
    thumbnailId: z.number().optional(),
    translations: z.array(z.object({
        languageId: z.number(),
        heading: z.string().min(1, "Heading is required"),
        description: z.string().min(1, "Description is required"),
    })),
})

export const defaultData = {
    tag: '',
    mediaIds: [] as number[],
    mainMediaId: undefined as number | undefined,
    thumbnailId: undefined as number | undefined,
    translations: [{ languageId: 1, heading: '', description: '' }]

}

export type CheckoutData = z.infer<typeof schema>;