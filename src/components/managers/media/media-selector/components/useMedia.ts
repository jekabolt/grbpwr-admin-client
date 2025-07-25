import { common_MediaFull } from "api/proto-http/admin";
import { useState } from "react";

export function useMedia() {
    const [media, setMedia] = useState<common_MediaFull[]>([]);

    async function fetchMedia() {

    }
}