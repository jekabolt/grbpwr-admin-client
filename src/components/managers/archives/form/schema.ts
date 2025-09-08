import { z } from "zod";



export const schema = z.object({
    heading: z.string().min(1, "Heading is required"),
    description: z.string().min(1, "Description is required"),
    tag: z.string().min(1, "Tag is required"),
    mediaIds: z.array(z.number()).default([]),
    mainMediaId: z.number().optional(),
    thumbnailId: z.number().optional(),
})

export const defaultData = {
    heading: '',
    description: '',
    tag: '',
    mediaIds: [] as number[],
    mainMediaId: undefined as number | undefined,
    thumbnailId: undefined as number | undefined,
}

export type CheckoutData = z.infer<typeof schema>;