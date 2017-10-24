import { fs } from 'mz';
import * as path from 'path';
import { trim } from 'lodash';
import * as shell from 'shelljs';
import * as ts from 'typescript';
import jsonic = require('jsonic');
import * as changeCase from 'change-case';
import { IVisitorContext } from './IVisitorContext';
import { IAstVisitor } from '@brad-jones/tsos-compiler';
import OpenApiSpecBuilder from '@brad-jones/openapi-spec-builder';
import IInfo from '@brad-jones/openapi-spec-builder/lib/v2/Modified/IInfo';
import ISchema from '@brad-jones/openapi-spec-builder/lib/v2/Modified/ISchema';
import IEndpoint from '@brad-jones/openapi-spec-builder/lib/v2/Modified/IEndpoint';
import IResponse from '@brad-jones/openapi-spec-builder/lib/v2/Modified/IResponse';
import IParameter from '@brad-jones/openapi-spec-builder/lib/v2/Modified/IParameter';
import
{
    Type, InterfaceDeclaration, TypeGuards, PropertyDeclaration,
    Symbol, ClassDeclaration, MethodDeclaration, ParameterDeclaration,
    Decorator, Node, PropertySignature, EnumDeclaration
}
from "ts-simple-ast";

// TODO: Update my openapi-spec-builder package to export these types instead of having them inline
type ItemType = 'string' | 'number' | 'integer' | 'boolean' | 'array';
type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'options';
type ParameterLocation = 'query' | 'header' | 'path' | 'formData' | 'body';
type ParameterType = 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'file';
type SchemaType = 'array' | 'boolean' | 'integer' | 'number' | 'null' | 'object' | 'string' | 'file';

// Other TODO items:
// - Better TypeScript Type to Swagger Type conversion generally
// - Still some duplicated code that could be further refactored
// - Pickup decorators from inherited classes, ie: Would be great to define the 500 and others responses on the BaseEndpoint

let GenerateSwaggerDoc: IAstVisitor = async (ast, ctx: IVisitorContext) =>
{
    console.log('Generating Swagger Document');

    let spec = new OpenApiSpecBuilder
    ({
        info: GenerateInfo(),
        schemes: ['http'],
        endpoints: GenerateEndpoints(ctx.endpointClasses)
    });

    let swaggerJson: string;
    try
    {
        swaggerJson = await spec.toJson();
    }
    catch (e)
    {
        console.error('\nThe generated swagger document has not passed validation!\n');
        console.error(JSON.stringify(e, null, 4));
        process.exit(1);
    }

    shell.mkdir('-p', __dirname + '/../dist/app');
    await fs.writeFile(__dirname + '/../dist/app/swagger.json', swaggerJson);

    /**
     * Pulls in data from the node `package.json` file so we
     * don't have 2 version numbers to keep up to date, etc.
     */
    function GenerateInfo(): IInfo
    {
        let pkg = require(`${__dirname}/../package.json`);

        return {
            title: pkg.description,
            version: pkg.version,
            contact: pkg.author,
            license: {
                name: pkg.license
            }
        };
    }

    /**
     * Given a list of `ClassDeclaration's` that are endpoint classes.
     * This orchestrates the process of building each endpoint definition.
     */
    function GenerateEndpoints(endPointClasses: ClassDeclaration[]): IEndpoint[]
    {
        let endpoints: IEndpoint[] = [];

        for (let endPointClass of endPointClasses)
        {
            let executeMethod = endPointClass.getInstanceMethodOrThrow('Execute');
            let { summary, description } = GetSummaryAndDescription(endPointClass);
            let path = GetPath(endPointClass);
            let tags = GetTags(executeMethod);
            let consumes = GetConsumes(endPointClass, executeMethod);
            let deprecated = IsDeprecated(executeMethod);
            let security = GetSecurity(executeMethod);
            let parameters = GetParameters(endPointClass, executeMethod, consumes);
            let { produces, responses } = GetResponses(endPointClass, executeMethod);

            // Each endpoint can actually define multiple swagger endpoints,
            // simply by responding to multiple HTTP Methods.
            for (let method of GetMethods(endPointClass))
            {
                let endpoint: IEndpoint = {} as any;
                endpoint.path = path;
                endpoint.method = method;
                endpoint.deprecated = deprecated;
                endpoint.parameters = parameters;
                endpoint.responses = responses;
                if (summary) endpoint.summary = summary;
                if (description) endpoint.description = description;
                if (tags) endpoint.tags = tags;
                if (security) endpoint.security = security;
                if (consumes) endpoint.consumes = consumes;
                if (produces) endpoint.produces = produces;
                endpoints.push(endpoint);
            }
        }

        return endpoints;
    }

    /**
     * Generates the responses and produces array,
     * given an endpoints execute method declaration.
     */
    function GetResponses(endPointClass: ClassDeclaration, executeMethod: MethodDeclaration): { responses: IResponse[], produces: string[] }
    {
        let value: { responses: IResponse[], produces: string[] } = { responses: [], produces: [] };

        let responseDecorators = executeMethod.getDecorators()
            .filter(d => d.getName() === 'Response');

        if (responseDecorators.length > 0)
        {
            for (let responseDecorator of responseDecorators)
            {
                let args = responseDecorator.getArguments();
                let typeArgs = responseDecorator.getTypeArguments();

                if (args[2])
                {
                    value.produces.push(DeQuote(args[2].getText()));
                }

                let response: IResponse = {
                    statusCode: parseInt(DeQuote(args[0].getText())),
                    description: args[1] && DeQuote(args[1].getText()) || ''
                };

                if (typeArgs[0])
                {
                    let interfaceNode = ast.getSourceFiles()
                        .map(_ => _.getInterfaces())
                        .reduce((c, p) => c.concat(p))
                        .find(_ => _.getName() === typeArgs[0].getText());

                    response.schema = BuildSchema(interfaceNode, responseDecorator);
                }

                value.responses.push(response);
            }
        }
        else
        {
            // Each endpoint in swagger *MUST* define at least one response.
            value.responses.push({ statusCode: 0, description: 'Default Response' });
            value.produces.push('application/json');
        }

        return value;
    }

    /**
     * Generates the parameter definitions for an endpoint,
     * this includes all types of parameters.
     *
     * ie: `'query' | 'header' | 'path' | 'formData' | 'body'`
     */
    function GetParameters(endPointClass: ClassDeclaration, executeMethod: MethodDeclaration, consumes: string[]): IParameter[]
    {
        let parameters: IParameter[] = [];

        for (let param of executeMethod.getParameters())
        {
            let fromDecorator = param.getDecorators().find(d => d.getName().startsWith('From'));
            if (!fromDecorator)
            {
                throw new Error('Endpoint parameters must be decorated with a "FromXyz" decorator!');
            }

            let location = fromDecorator.getName()
                .replace('From', '').replace('Route', 'Path')
                .toLowerCase() as ParameterLocation;

            if (location === 'body')
            {
                let fromDecoratorArgs = fromDecorator.getArguments();

                if (consumes.includes('multipart/form-data') || fromDecoratorArgs[0] && DeQuote(fromDecoratorArgs[0].getText()) === 'form')
                {
                    if (consumes.includes('multipart/form-data'))
                    {
                        parameters.push(...GetMultiPartPostBodyParameters(param, endPointClass));
                    }
                    else
                    {
                        parameters.push(...GetPostBodyParameters(param));
                    }
                }
                else
                {
                    parameters.push(GetBodyParameter(param));
                }
            }
            else
            {
                parameters.push(GetNonBodyParameter(param, fromDecorator, location));
            }
        }

        return parameters;
    }

    /**
     * Generates a "raw" body parameter.
     *
     * Therotially we could support multiple mime types here
     * but for now we assume this will be `application/json`.
     *
     * The type of the parameter can be any complex type,
     * it will be recursed until all sub types have been defined.
     */
    function GetBodyParameter(param: ParameterDeclaration): IParameter
    {
        return <IParameter>
        {
            name: param.getName(),
            in: 'body',
            schema: BuildSchema(param.getType(), param)
        };
    }

    /**
     * Generates a parameter that is not in the body.
     * ie: header, query and route parameters.
     */
    function GetNonBodyParameter(param: ParameterDeclaration, fromDecorator: Decorator, location: ParameterLocation): IParameter
    {
        let name = param.getName();
        let args = fromDecorator.getArguments();

        if (args[0] && args[0].getText() !== 'null' && args[0].getText() !== 'undefined')
        {
            name = DeQuote(args[0].getText());
        }

        let description = '';
        if (args[1] && args[1].getText() !== 'null' && args[1].getText() !== 'undefined')
        {
            description = DeQuote(args[1].getText());
        }

        let required = false;
        if (location === 'path')
        {
            required = true;
        }
        else if (args[2])
        {
            required = args[2].getText() === 'true';
        }

        let p = <IParameter>
        {
            name: name,
            in: location,
            type: ConvertTypeScriptTypeToParameterType(param.getType()),
            required: required,
            description: description,

        };

        if (param.getType().isArrayType())
        {

            p.items =
            {
                type: ConvertPrimativeArrayToItemType(param.getType())
            };

            let literalType = GetLiteralOrEnumValues(param.getType().getTypeArguments()[0]);
            if (literalType)
            {
                p.items.enum = literalType;
            }
        }

        let literalType = GetLiteralOrEnumValues(param.getType());
        if (literalType)
        {
            p.enum = literalType;
        }

        return p;
    }

    /**
     * Generates "posted" body parameters.
     * ie: application/x-www-form-urlencoded
     *
     * The parameters type is assumed to be a simple non-recursive structure.
     * If the type is anything but a simple key/value structure,
     * you should be using json anyway.
     */
    function GetPostBodyParameters(param: ParameterDeclaration): IParameter[]
    {
        return param.getType().getProperties().map(prop =>
        {
            let p = <IParameter>
            {
                name: prop.getName(),
                in: 'formData',
                type: ConvertTypeScriptTypeToParameterType(prop.getTypeAtLocation(param)),
                description: GetJsDocFromSymbol(prop),
                required: !(prop.compilerSymbol.getDeclarations() as any).some(_ => _.questionToken)
            };

            if (prop.getTypeAtLocation(param).isArrayType())
            {
                p.items =
                {
                    type: ConvertPrimativeArrayToItemType(prop.getTypeAtLocation(param))
                };

                let literalType = GetLiteralOrEnumValues(prop.getTypeAtLocation(param).getTypeArguments()[0]);
                if (literalType)
                {
                    p.items.enum = literalType;
                }
            }

            let literalType = GetLiteralOrEnumValues(prop.getTypeAtLocation(param));
            if (literalType)
            {
                p.enum = literalType;
            }

            return p;
        });
    }

    /**
     * Generates a "multipart posted" body parameter.
     * ie: multipart/form-data
     *
     * The parameters type is assumed to match the `IMultiPartForm` type.
     */
    function GetMultiPartPostBodyParameters(param: ParameterDeclaration, endPointClass: ClassDeclaration): IParameter[]
    {
        let parameters: IParameter[] = [];

        let props = param.getType().getProperties();

        parameters.push(...props.find(_ => _.getName() === 'fields').getTypeAtLocation(param).getProperties().map(prop =>
        {
            let p = <IParameter>
            {
                name: prop.getName(),
                in: 'formData',
                type: ConvertTypeScriptTypeToParameterType(prop.getTypeAtLocation(param)),
                description: GetJsDocFromSymbol(prop),
                required: !(prop.compilerSymbol.getDeclarations() as any).some(_ => _.questionToken)
            };

            if (prop.getTypeAtLocation(param).isArrayType())
            {
                p.items =
                {
                    type: ConvertPrimativeArrayToItemType(prop.getTypeAtLocation(param))
                };

                let literalType = GetLiteralOrEnumValues(prop.getTypeAtLocation(param).getTypeArguments()[0]);
                if (literalType)
                {
                    p.items.enum = literalType;
                }
            }

            let literalType = GetLiteralOrEnumValues(prop.getTypeAtLocation(param));
            if (literalType)
            {
                p.enum = literalType;
            }

            return p;
        }));

        parameters.push(...props.find(_ => _.getName() === 'files').getTypeAtLocation(param).getProperties().map(prop =>
        {
            if (ConvertTypeScriptTypeToParameterType(param.getType()) === 'array')
            {
                throw new Error
                ('\
                    Swagger 2.0 does not really support multi-uploads, \
                    koa-body does though, so until we upgrade to OpenAPI 3.0 \
                    please hide this endpoint "'+endPointClass.getSourceFile().getFilePath()+'" \
                    with the @Hidden decorator.\
                ');
            }

            return <IParameter>
            {
                name: prop.getName(),
                in: 'formData',
                type: 'file' as any,
                description: GetJsDocFromSymbol(prop),
                required: !(prop.compilerSymbol.getDeclarations() as any).some(_ => _.questionToken)
            };
        }));

        return parameters;
    }

    /**
     * Given an type and the target that it was defined at this will
     * recursively generate a Swagger Schema from the TypeScript interfaces.
     * This is used by both the `GetBodyParameter` & `GetResponses` methods.
     */
    function BuildSchema(type: Type<ts.Type> | InterfaceDeclaration, targetNode: Node<ts.Node>): ISchema
    {
        let required = [];
        let schema: ISchema = { type: 'object' };
        let schemaProps: { [name: string]: ISchema } = {};

        let props: Symbol[] = [];
        let tempProps = type.getProperties();
        if (tempProps[0] instanceof Symbol)
        {
            props = tempProps as Symbol[];
        }
        else
        {
            props = (tempProps as PropertySignature[]).map(_ => _.getSymbol());
        }

        for (let prop of props)
        {
            if (!(prop.compilerSymbol.getDeclarations() as any).some(_ => _.questionToken))
            {
                required.push(prop.getName());
            }

            let description = GetJsDocFromSymbol(prop);

            if
            (
                prop.getTypeAtLocation(targetNode).isInterfaceType() ||
                prop.getTypeAtLocation(targetNode).isAnonymousType() ||
                (
                    prop.getTypeAtLocation(targetNode).getTypeArguments()[0] &&
                    (
                        prop.getTypeAtLocation(targetNode).getTypeArguments()[0].isAnonymousType() ||
                        prop.getTypeAtLocation(targetNode).getTypeArguments()[0].isInterfaceType()
                    )
                )
            ){
                schemaProps[prop.getName()] =
                {
                    type: prop.getTypeAtLocation(targetNode).isArrayType() ? 'array' : 'object',
                    description: description
                };

                if (prop.getTypeAtLocation(targetNode).isArrayType())
                {
                    if (prop.getTypeAtLocation(targetNode).getTypeArguments()[0])
                    {
                        schemaProps[prop.getName()].items = BuildSchema(prop.getTypeAtLocation(targetNode).getTypeArguments()[0], targetNode);
                    }
                    else
                    {
                        schemaProps[prop.getName()].items = BuildSchema(prop.getTypeAtLocation(targetNode), targetNode);
                    }
                }
                else
                {
                    schemaProps[prop.getName()].properties = BuildSchema(prop.getTypeAtLocation(targetNode), targetNode).properties;
                }
            }
            else
            {
                schemaProps[prop.getName()] =
                {
                    type: ConvertTypeScriptTypeToSchemaType(prop.getTypeAtLocation(targetNode)),
                    description: description
                };

                if (prop.getTypeAtLocation(targetNode).isArrayType())
                {
                    schemaProps[prop.getName()].items =
                    {
                        type: ConvertPrimativeArrayToSchemaType(prop.getTypeAtLocation(targetNode).getTypeArguments()[0])
                    };

                    let literalType = GetLiteralOrEnumValues(prop.getTypeAtLocation(targetNode).getTypeArguments()[0]);
                    if (literalType)
                    {
                        schemaProps[prop.getName()].items.enum = literalType;
                    }
                }

                let literalType = GetLiteralOrEnumValues(prop.getTypeAtLocation(targetNode));
                if (literalType)
                {
                    schemaProps[prop.getName()].enum = literalType;
                }
            }
        }

        if (required.length > 0) schema.required = required;
        schema.properties = schemaProps;

        return schema;
    }

    /**
     * Generates security defintions for each endpoint.
     * This is untyped so be careful with what goes into the `@Security` decorator.
     */
    function GetSecurity(executeMethod: MethodDeclaration)
    {
        let value = [];

        let securityDecorators = executeMethod.getDecorators()
            .filter(_ => _.getName() === 'Security');

        for (let securityDecorator of securityDecorators)
        {
            let obj = {};
            let args = securityDecorator.getArguments();
            let key = DeQuote(args[0].getText());
            obj[key] = [];
            if (args[1]) obj[key] = JSON.parse(args[1].getText());
            value.push(obj);
        }

        return value.length > 0 ? value : undefined;
    }

    /**
     * Works out if the given endpoint has been marked as Deprecated.
     */
    function IsDeprecated(executeMethod: MethodDeclaration): boolean
    {
        return executeMethod.getDecorators().findIndex(d => d.getName() === 'Deprecated') > 0;
    }

    /**
     * Generates the consumes array of mime types for an endpoint.
     */
    function GetConsumes(endPointClass: ClassDeclaration, executeMethod: MethodDeclaration): string[]
    {
        let consumes: string[] = [];

        let bodyParserOptionsProp = endPointClass.getStaticProperty('BodyParserOptions') as PropertyDeclaration;

        if (bodyParserOptionsProp && bodyParserOptionsProp.getInitializer())
        {
            let options = jsonic(bodyParserOptionsProp.getInitializer().getText());

            if (options.multipart)
            {
                consumes.push('multipart/form-data');
            }
        }
        else if (executeMethod.getParameters().filter(_ => _.getDecorators().some(d => d.getName() === 'FromBody' && d.getArguments()[0] && DeQuote(d.getArguments()[0].getText()) === 'form')).length > 0)
        {
            consumes.push('application/x-www-form-urlencoded');
        }
        else if (executeMethod.getParameters().filter(_ => _.getDecorators().some(d => d.getName() === 'FromBody')).length > 0)
        {
            consumes.push('application/json');
        }

        return consumes.length > 0 ? consumes : undefined;
    }

    /**
     * Extracts any tags from the `@Tags` decorator.
     */
    function GetTags(executeMethod: MethodDeclaration): string[]
    {
        let tags: string[] = [];

        let tagDecorator = executeMethod.getDecorators()
            .find(d => d.getName() === 'Tags');

        if (tagDecorator)
        {
            tags = tagDecorator.getArguments().map(_ => DeQuote(_.getText()));
        }

        return tags.length > 0 ? tags : undefined;
    }

    /**
     * Builds the relative path to the endpoint based on it file path.
     * Also take into account any `@Route` decorators.
     */
    function GetPath(endPointClass: ClassDeclaration): string
    {
        let endpointPath = '/' + changeCase.pathCase
        (
            endPointClass.getSourceFile().getFilePath()
            .replace(ctx.srcDir + '/app/Endpoints', '')
            .replace('.ts', '')
        );

        let route = endPointClass.getStaticProperty('Route') as PropertyDeclaration;
        if (route)
        {
            let routePath = DeQuote(route.getInitializerOrThrow().getText());
            if (routePath.startsWith('/'))
            {
                endpointPath = routePath;
            }
            else
            {
                endpointPath = endpointPath + '/' + routePath;
            }
        }

        return endpointPath;
    }

    /**
     * Gets a list of HTTP Methods that the endpoint says it will respond to.
     */
    function GetMethods(endPointClass: ClassDeclaration): HttpMethod[]
    {
        let methods: HttpMethod[] = ['get'];

        let methodsProp = endPointClass.getStaticProperty('Methods') as PropertyDeclaration;

        if (methodsProp)
        {
            methods = JSON.parse(methodsProp.getInitializerOrThrow().getText()).map(m => m.toLowerCase());
        }

        return methods;
    }

    /**
     * Extracts a summary and description from a possible docblock
     * againt the endpoint class (not the Execute method).
     */
    function GetSummaryAndDescription(endPointClass: ClassDeclaration): { summary: string, description: string }
    {
        let value = { summary: undefined, description: undefined };

        let docBlock = endPointClass.getDocumentationComment();

        if (docBlock)
        {
            let lines = docBlock.split("\n");
            value.summary = lines[0];
            value.description = trim(lines.slice(1).join("\n"));
        }

        return value;
    }

    /**
     * Given a TypeScript type we will do our best
     * to convert it to a Swagger ParameterType.
     */
    function ConvertTypeScriptTypeToParameterType(type: Type<ts.Type>): ParameterType
    {
        let swaggerType = type.getText().toLowerCase();

        console.log(swaggerType);

        if (type.isInterfaceType() || type.isAnonymousType())
        {
            throw new Error('Complex types not supported');
        }

        if (type.isArrayType())
        {
            swaggerType = 'array';
        }

        if (type.isUnionType() || type.isEnumType())
        {
            swaggerType = "string";
        }

        return swaggerType as ParameterType;
    }

    function ConvertTypeScriptTypeToSchemaType(type: Type<ts.Type>): SchemaType
    {
        let swaggerType = type.getText().toLowerCase();

        if (type.isInterfaceType() || type.isAnonymousType())
        {
            throw new Error('Complex types not supported');
        }

        if (type.isArrayType())
        {
            swaggerType = 'array';
        }

        if (type.isUnionType() || type.isEnumType())
        {
            swaggerType = "string";
        }

        return swaggerType as SchemaType;
    }

    function ConvertPrimativeArrayToSchemaType(type: Type<ts.Type>): SchemaType
    {
        if (type.isUnionType() || type.getTypeArguments()[0].isUnionType())
        {
            return "string";
        }

        // TODO: This is obviously super hacky and needs a real solution
        return type.getText()
            .toLowerCase()
            .replace('array', '')
            .replace('[]', '')
            .replace('<', '')
            .replace('>', '') as SchemaType;
    }

    function ConvertPrimativeArrayToItemType(type: Type<ts.Type>): ItemType
    {
        if (type.isUnionType() || type.getTypeArguments()[0].isUnionType())
        {
            return "string";
        }

        // TODO: This is obviously super hacky and needs a real solution
        return type.getText()
            .toLowerCase()
            .replace('array', '')
            .replace('[]', '')
            .replace('<', '')
            .replace('>', '') as ItemType;
    }

    /**
     * Given a type, that is a String/Number literal or Enum.
     * Both these types get treated very similarly in the ast.
     * Then we will return an array of values. Otherwise false.
     */
    function GetLiteralOrEnumValues(type: Type<ts.Type>): false | string[] | number[]
    {
        // NOTE: Enum appears to be a sub type of UnionType
        if (type.isUnionType())
        {
            if (type.compilerType.types)
            {
                if (type.compilerType.types['containsStringOrNumberLiteral'] === true)
                {
                    let values = [];

                    for (let typeObject of type.compilerType.types)
                    {
                        if (typeObject.symbol)
                        {
                            // This handles the Enum case
                            values.push(typeObject.symbol.escapedName);
                        }
                        else if (typeObject['value'])
                        {
                            // This handles the string literal case
                            values.push(typeObject['value']);
                        }
                    }

                    return values;
                }
            }
        }

        return false;
    }

    /**
     * Given a Symbol node (which is not necessarily an actual ES6 Symbol)
     * we will attempt to extract the the JsDoc Comment, on failure we
     * return an empty string.
     */
    function GetJsDocFromSymbol(node: Symbol): string
    {
        let value = '';

        let valueDeclaration = node.compilerSymbol.valueDeclaration as any;

        if (valueDeclaration.jsDoc && valueDeclaration.jsDoc[0] && valueDeclaration.jsDoc[0].comment)
        {
            value = valueDeclaration.jsDoc[0].comment;
        }

        return value;
    }

    /**
     * A helper function used to remove surrounding quotes from strings.
     */
    function DeQuote(input: string): string
    {
        return trim(input, '"\'');
    }
};

export default GenerateSwaggerDoc;
