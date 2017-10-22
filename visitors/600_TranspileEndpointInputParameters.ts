import { trim } from 'lodash';
import { IAstVisitor } from '@brad-jones/tsos-compiler';

let TranspileEndpointInputParameters: IAstVisitor = (ast) =>
{
    console.log('Transpiling Endpoint Input Parameters');

    let endpointClasses = ast.getSourceFiles()
        .map(_ => _.getClasses())
        .reduce((a, b) => a.concat(b))
        .filter(c => c.getImplements().some(i => i.getText() === 'IEndpoint'));

    endpointClasses.forEach(endpoint =>
    {
        let inputCode = '';

        let method = endpoint.getInstanceMethod('Execute');

        method.getParameters().forEach(p =>
        {
            inputCode = inputCode + `let ${p.getName()}: ${p.getType().getText()} = `;

            let decorator = p.getDecorators()[0];

            if (decorator)
            {
                let key = p.getName();
                if (decorator.getArguments()[0] && decorator.getArguments()[0].getText() !== 'null' && decorator.getArguments()[0].getText() !== 'undefined')
                {
                    key = decorator.getArguments()[0].getText();
                }
                key = trim(key, '"\'');

                switch (decorator.getName())
                {
                    case 'FromHeader': inputCode = inputCode + `this.Ctx.headers['${key.toLowerCase()}'];\n`; break;
                    case 'FromRoute': inputCode = inputCode + `this.Ctx.params['${key}'];\n`; break;
                    case 'FromQuery': inputCode = inputCode + `this.Ctx.query['${key}'];\n`; break;
                    case 'FromBody': inputCode = inputCode + `this.Ctx.request.body;\n`; break;
                    default: throw new Error('Unrecognised "FromXyz" decorator!');
                }
            }
            else
            {
                throw new Error('Endpoint parameters must be decorated with a "FromXyz" decorator!');
            }

            p.remove();
        });

        let body = method.getBody().getText().trim();
        method.setBodyText(inputCode + body.substring(1, body.length - 1));
    });
};

export default TranspileEndpointInputParameters;
