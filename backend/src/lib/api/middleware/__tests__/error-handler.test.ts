/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response } from "express";
import errorHandler from "../error-handler";

const successfulRouteHandler = jest.fn(() => Promise.resolve());
const failedRouteHandler = jest.fn(() => Promise.reject("error"));

const req = {} as Request;
const res = {
  status: jest.fn() as any,
  send: jest.fn() as any,
} as Response;

describe("withErrorHandler", () => {
  it("calls the route handler", async () => {
    await errorHandler(successfulRouteHandler)(req, res);
    expect(successfulRouteHandler).toBeCalled();
  });

  it("handles error and returns a 500 error", async () => {
    console.error = jest.fn();
    await errorHandler(failedRouteHandler)(req, res);
    expect(res.status).toBeCalledWith(500);
    expect(console.error).toBeCalledWith("error");
    expect(res.send).toBeCalledWith("Internal server error");
  });
});
