import { MakeGenerics } from "@tanstack/react-location";

export type ProductIdProps = MakeGenerics<{
    Params: {
        id: string
    }
}>