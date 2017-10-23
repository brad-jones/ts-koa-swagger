import * as changeCase from 'change-case';
import { IVisitorContext } from './IVisitorContext';
import { IAstVisitor } from '@brad-jones/tsos-compiler';

let AutoRegisterEndpoints: IAstVisitor = async (ast, ctx: IVisitorContext) =>
{
    console.log('Inserting Endpoint Bindings into Container');

    ctx.endpointClasses = ctx.injectAbleClasses
        .filter(c => c.getImplements().some(i => i.getText() === 'IEndpoint'));

    ctx.containerSrcFile.addImport({ namedImports: [{name: 'IEndpoint'}], moduleSpecifier: 'app/Types' });
    ctx.containerSrcFile.addImports(ctx.endpointClasses.map((endpoint, index) =>
    {
        return {
            defaultImport: 'Endpoint_' + index,
            moduleSpecifier: endpoint.getSourceFile().getFilePath().replace(ctx.srcDir + '/', '').replace('.ts', '')
        };
    }));

    ctx.endpointClasses.forEach((endpoint, index) =>
    {
        let endpointPath = changeCase.pathCase
        (
            endpoint.getSourceFile().getFilePath()
                .replace(ctx.srcDir + '/app/Endpoints', '')
                .replace('.ts', '')
        );

        let buildContainerFunc = ctx.containerSrcFile.getFunction('BuildContainer');
        let body = buildContainerFunc.getBody().getText().trim();
        buildContainerFunc.setBodyText(`${body.substring(1, body.length - 1).replace('return container;', '')}\ncontainer.bind(IEndpoint).to(Endpoint_${index}).whenTargetNamed('${endpointPath}');\nreturn container;`);
    });
};

export default AutoRegisterEndpoints;
