import { fs } from 'mz';
import { IVisitorContext } from './IVisitorContext';
import { IAstVisitor } from '@brad-jones/tsos-compiler';

let AutoRegisterContainerModules: IAstVisitor = async (ast, ctx: IVisitorContext) =>
{
    console.log('Inserting Container Modules into Container');

    ctx.srcDir = await fs.realpath(__dirname + '/../src');

    ctx.containerSrcFile = ast.getSourceFile('src/app/Container.ts');

    let containerModules = ast.getSourceFiles()
        .filter(s => s.getFilePath().endsWith('InversifyContainerModule.ts'));

    ctx.containerSrcFile.addImports(containerModules.map((cm, index) =>
    {
        return {
            defaultImport: 'Cm_' + index,
            moduleSpecifier: cm.getFilePath().replace(ctx.containerSrcFile + '/', '').replace('.ts', '')
        };
    }));

    containerModules.forEach((cm, index) =>
    {
        let buildContainerFunc = ctx.containerSrcFile.getFunction('BuildContainer');
        let body = buildContainerFunc.getBody().getText().trim();
        buildContainerFunc.setBodyText(`${body.substring(1, body.length - 1).replace('return container;', '')}\ncontainer.load(Cm_${index});\nreturn container;`);
    });
};

export default AutoRegisterContainerModules;
