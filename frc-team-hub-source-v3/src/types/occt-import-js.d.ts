declare module "occt-import-js" {
  interface OcctMesh {
    attributes: {
      position: { array: number[] | Float32Array };
      normal?: { array: number[] | Float32Array };
    };
    index?: { array: number[] | Uint32Array };
    name?: string;
    color?: number[];
  }

  interface OcctResult {
    success: boolean;
    meshes: OcctMesh[];
  }

  interface OcctInstance {
    ReadStepFile(
      content: Uint8Array,
      params: unknown,
    ): OcctResult;
    ReadBrepFile?(content: Uint8Array, params: unknown): OcctResult;
    ReadIgesFile?(content: Uint8Array, params: unknown): OcctResult;
  }

  function occtimportjs(options?: unknown): Promise<OcctInstance>;
  export default occtimportjs;
}
