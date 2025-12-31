# Contracts: Generative Media Billing Support

**Date**: 2025-12-31
**Feature**: 001-image-billing

## Overview

This feature is an internal enhancement to the billing calculation system. It does not modify any external API contracts.

## No External Contract Changes

- **API Routes**: No new endpoints, no changes to existing endpoint signatures
- **Request Format**: Unchanged - clients continue sending the same request format
- **Response Format**: Unchanged - responses maintain backward compatibility

## Internal Contract Changes

The following internal interfaces are extended (see `data-model.md` for details):

1. **Usage Object**: Extended with media fields (`input_images`, `output_images`, `output_duration_seconds`)
2. **Cost Result Object**: Extended with media cost breakdown
3. **Redis Storage**: Extended with media usage fields

These changes are internal to the relay service and do not affect external clients.

## Cost Calculation Response (Internal)

The extended `calculateCost()` return structure is documented in `data-model.md` section 3.
