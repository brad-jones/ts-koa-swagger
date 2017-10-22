import { IEndpoint } from 'app/Types';
import { interfaces } from 'inversify';
import { Get, FromRoute, Response } from 'app/Decorators';
import { BaseEndpoint } from 'app/Endpoints/BaseEndpoint';

export default class Foo extends BaseEndpoint implements IEndpoint
{
    @Get('{bar}')
    @Response<IFooResponse>(200)
    public async Execute(@FromRoute() bar: string)
    {
        return { foo: bar };
    }
}

export interface IFooResponse
{
    foo: string;
}
