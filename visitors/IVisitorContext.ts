import { SourceFile, ClassDeclaration } from 'ts-simple-ast';

export interface IVisitorContext
{
    injectAbleClasses: ClassDeclaration[];
    endpointClasses: ClassDeclaration[];
    middlewareClasses: ClassDeclaration[];
    srcDir: string;
    containerSrcFile: SourceFile;
}
