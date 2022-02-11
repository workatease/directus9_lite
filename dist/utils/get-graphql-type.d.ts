import { GraphQLScalarType, GraphQLList, GraphQLType } from 'graphql';
import { Type } from '@directus/shared/types';
export declare function getGraphQLType(localType: Type | 'alias' | 'unknown'): GraphQLScalarType | GraphQLList<GraphQLType>;
