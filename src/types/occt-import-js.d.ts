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

  type OcctResult =
    | { success: true; meshes: OcctMesh[]; root: unknown }
    | { success: false };

  interface OcctParams {
    linearUnit?: "millimeter" | "centimeter" | "meter" | "inch" | "foot";
    linearDeflectionType?: "bounding_box_ratio" | "absolute_value";
    linearDeflection?: number;
    angularDeflection?: number;
  }

  interface OcctOptions {
    locateFile?: (path: string, prefix?: string) => string;
  }

  interface OcctInstance {
    ReadStepFile(content: Uint8Array, params: OcctParams | null): OcctResult;
    ReadBrepFile?(content: Uint8Array, params: OcctParams | null): OcctResult;
    ReadIgesFile?(content: Uint8Array, params: OcctParams | null): OcctResult;
  }

  function occtimportjs(options?: OcctOptions): Promise<OcctInstance>;
  export default occtimportjs;
}
