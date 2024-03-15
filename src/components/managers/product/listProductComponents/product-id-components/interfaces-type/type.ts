import { MakeGenerics } from "@tanstack/react-location";

export type ProductIDProps = MakeGenerics<{
    Params: {
        id: string;
    };
}>;