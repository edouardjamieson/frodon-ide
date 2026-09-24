export interface File {
    name: string
    path: string
    isDir: boolean
    children?: File[]
}