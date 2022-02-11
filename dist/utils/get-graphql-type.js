"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGraphQLType = void 0;
const graphql_1 = require("graphql");
const graphql_compose_1 = require("graphql-compose");
const graphql_2 = require("../services/graphql");
function getGraphQLType(localType) {
    switch (localType) {
        case 'boolean':
            return graphql_1.GraphQLBoolean;
        case 'bigInteger':
        case 'integer':
            return graphql_1.GraphQLInt;
        case 'decimal':
        case 'float':
            return graphql_1.GraphQLFloat;
        case 'csv':
            return new graphql_1.GraphQLList(graphql_1.GraphQLString);
        case 'json':
            return graphql_compose_1.GraphQLJSON;
        case 'geometry':
            return graphql_2.GraphQLGeoJSON;
        case 'timestamp':
        case 'dateTime':
        case 'date':
            return graphql_2.GraphQLDate;
        default:
            return graphql_1.GraphQLString;
    }
}
exports.getGraphQLType = getGraphQLType;
