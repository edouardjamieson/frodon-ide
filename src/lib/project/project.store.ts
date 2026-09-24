import { create } from "zustand";
import type { ProjectStore } from "./project.def";

export const useProjectStore = create<ProjectStore>((set, get) => ({
    path: '',
    name: '',
    files: [],

    setProject: (path, name, files) => set(() => {
        return {
            path,
            name,
            files
        }
    })
}))