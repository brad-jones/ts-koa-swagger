import { fs } from 'mz';
import * as path from 'path';
import * as changeCase from 'change-case';
import { IAstVisitor } from '@brad-jones/tsos-compiler';

let AutoRegisterEndpoints: IAstVisitor = async (ast) =>
{
    console.log('Inserting Endpoint Bindings into Container');

    let srcDir = await fs.realpath(__dirname + '/../src');

    let containerSrcFile = ast.getSourceFile('src/app/Container.ts');

    let endpointClasses = ast.getSourceFiles()
        .map(_ => _.getClasses())
        .reduce((a, b) => a.concat(b))
        .filter(c => c.getImplements().some(i => i.getText() === 'IEndpoint'));

    containerSrcFile.addImport({ namedImports: [{name: 'IEndpoint'}], moduleSpecifier: 'app/Types' });
    containerSrcFile.addImports(endpointClasses.map((endpoint, index) =>
    {
        return {
            defaultImport: 'Endpoint_' + index,
            moduleSpecifier: endpoint.getSourceFile().getFilePath().replace(srcDir + '/', '').replace('.ts', '')
        };
    }));

    endpointClasses.forEach((endpoint, index) =>
    {
        let endpointPath = changeCase.pathCase
        (
            endpoint.getSourceFile().getFilePath()
                .replace(srcDir + '/app/Endpoints', '')
                .replace('.ts', '')
        );

        let buildContainerFunc = containerSrcFile.getFunction('BuildContainer');
        let body = buildContainerFunc.getBody().getText().trim();
        buildContainerFunc.setBodyText(`${body.substring(1, body.length - 1).replace('return container;', '')}\ncontainer.bind(IEndpoint).to(Endpoint_${index}).whenTargetNamed('${endpointPath}');\nreturn container;`);
    });
};

export default AutoRegisterEndpoints;
